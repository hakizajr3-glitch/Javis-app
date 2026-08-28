import { v4 as uuidv4 } from 'uuid';
import {
  SkillId,
  Skill,
  SkillParameter,
  SkillProposal as SkillProposalType,
  TaskLog,
} from './types.js';
import { patternDetection } from './patternDetection.js';
import { taskLogger } from './taskLogger.js';
import { eventBus, EventType } from '../observability/eventBus.js';
import { llmOrchestrator } from '../llm-orchestrator/llmOrchestrator.js';

export class SkillProposalManager {
  private skills: Map<SkillId, Skill> = new Map();
  private proposals: Map<string, SkillProposalType> = new Map();

  async generateSkillProposals(userId: string): Promise<SkillProposalType[]> {
    const patterns = await patternDetection.getPatterns(userId);
    const proposals: SkillProposalType[] = [];

    for (const pattern of patterns) {
      // Check if skill already exists for this pattern
      const existingSkill = this.findSkillForPattern(pattern);
      
      if (!existingSkill) {
        const proposal = await this.createSkillProposal(pattern, userId);
        if (proposal) {
          proposals.push(proposal);
          this.proposals.set(proposal.skill.id, proposal);
        }
      }
    }

    // Emit event for new proposals
    if (proposals.length > 0) {
      await eventBus.publish({
        id: uuidv4(),
        type: EventType.TASK_COMPLETED,
        payload: { 
          action: 'skill_proposals_generated',
          count: proposals.length,
          proposals: proposals.map(p => ({ id: p.skill.id, name: p.skill.name }))
        },
        timestamp: new Date(),
        source: 'SkillProposal',
        correlationId: userId,
      });
    }

    return proposals;
  }

  async approveSkill(skillId: SkillId, userId: string): Promise<void> {
    const proposal = this.proposals.get(skillId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${skillId}`);
    }

    // Update skill status to installed
    const skill = proposal.skill;
    skill.status = 'installed';
    skill.updatedAt = new Date();

    this.skills.set(skillId, skill);
    this.proposals.delete(skillId);

    await eventBus.publish({
      id: uuidv4(),
      type: EventType.TASK_COMPLETED,
      payload: { action: 'skill_installed', skillId, skillName: skill.name },
      timestamp: new Date(),
      source: 'SkillProposal',
      correlationId: userId,
    });
  }

  async rejectSkill(skillId: SkillId, _reason: string): Promise<void> {
    this.proposals.delete(skillId);
  }

  async executeSkill(skillId: SkillId, parameters: Record<string, any>, userId: string): Promise<any> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    if (skill.status !== 'installed') {
      throw new Error(`Skill is not installed: ${skillId}`);
    }

    const startTime = Date.now();

    try {
      // Execute skill code (in production, this would use a sandboxed environment)
      const result = await this.executeSkillCode(skill.code, parameters);

      const duration = Date.now() - startTime;

      // Update performance metrics
      skill.performance.usageCount++;
      skill.performance.lastUsed = new Date();
      skill.performance.averageDuration = 
        (skill.performance.averageDuration * (skill.performance.usageCount - 1) + duration) / 
        skill.performance.usageCount;

      this.skills.set(skillId, skill);

      // Log the task
      await taskLogger.logTask({
        description: `Executed skill: ${skill.name}`,
        context: { skillId },
        parameters,
        result,
        success: true,
        duration,
        userId,
        tags: ['skill', skill.name],
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Update performance metrics
      skill.performance.usageCount++;
      skill.performance.successRate = 
        (skill.performance.successRate * (skill.performance.usageCount - 1)) / 
        skill.performance.usageCount;

      this.skills.set(skillId, skill);

      // Log the failed task
      await taskLogger.logTask({
        description: `Failed skill execution: ${skill.name}`,
        context: { skillId },
        parameters,
        result: { error: (error as Error).message },
        success: false,
        duration,
        userId,
        tags: ['skill', skill.name, 'failed'],
      });

      throw error;
    }
  }

  async getSkills(userId?: string): Promise<Skill[]> {
    let skills = Array.from(this.skills.values());

    if (userId) {
      skills = skills.filter(s => s.createdBy === userId);
    }

    return skills.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getSkill(skillId: SkillId): Promise<Skill | null> {
    return this.skills.get(skillId) || null;
  }

  async getProposals(userId?: string): Promise<SkillProposalType[]> {
    let proposals = Array.from(this.proposals.values());

    if (userId) {
      proposals = proposals.filter(p => p.skill.createdBy === userId);
    }

    return proposals.sort((a, b) => b.confidence - a.confidence);
  }

  async updateSkill(skillId: SkillId, updates: Partial<Skill>): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const updatedSkill: Skill = {
      ...skill,
      ...updates,
      updatedAt: new Date(),
    };

    this.skills.set(skillId, updatedSkill);
  }

  async deleteSkill(skillId: SkillId): Promise<void> {
    this.skills.delete(skillId);
  }

  async getSkillStats(userId: string): Promise<{
    totalSkills: number;
    installedSkills: number;
    proposedSkills: number;
    totalUsage: number;
    averageSuccessRate: number;
    byStatus: Record<string, number>;
  }> {
    const skills = await this.getSkills(userId);
    const proposals = await this.getProposals(userId);

    const installed = skills.filter(s => s.status === 'installed').length;
    const totalUsage = skills.reduce((sum, s) => sum + s.performance.usageCount, 0);
    const avgSuccessRate = skills.length > 0
      ? skills.reduce((sum, s) => sum + s.performance.successRate, 0) / skills.length
      : 0;

    const byStatus: Record<string, number> = {};
    for (const skill of skills) {
      byStatus[skill.status] = (byStatus[skill.status] || 0) + 1;
    }

    return {
      totalSkills: skills.length,
      installedSkills: installed,
      proposedSkills: proposals.length,
      totalUsage,
      averageSuccessRate: avgSuccessRate,
      byStatus,
    };
  }

  private findSkillForPattern(pattern: any): Skill | null {
    for (const skill of this.skills.values()) {
      if (skill.name === this.generateSkillName(pattern.description)) {
        return skill;
      }
    }
    return null;
  }

  private async createSkillProposal(pattern: any, userId: string): Promise<SkillProposalType | null> {
    // Use LLM to generate skill code
    const skillName = this.generateSkillName(pattern.description);
    const skillDescription = `Automated skill for: ${pattern.description}`;

    const prompt = `
Based on the following task pattern, generate a reusable skill:

Pattern: ${pattern.description}
Frequency: ${pattern.frequency}
Confidence: ${pattern.confidence}

Example tasks:
${pattern.examples.slice(0, 3).map((e: TaskLog) => `- ${e.description}: ${JSON.stringify(e.parameters)}`).join('\n')}

Generate a TypeScript function that:
1. Takes the common parameters as input
2. Performs the task
3. Returns the result

Provide the code in a single code block.
`;

    try {
      const response = await llmOrchestrator.executeRequest({
        prompt,
        provider: 'anthropic', // Use Claude for code generation
      });

      // Extract code from response
      const code = this.extractCodeFromResponse(response.content);

      if (!code) {
        return null;
      }

      // Extract parameters from code
      const parameters = this.extractParametersFromCode(code);

      const skill: Skill = {
        id: uuidv4() as SkillId,
        name: skillName,
        description: skillDescription,
        code,
        parameters,
        examples: pattern.examples,
        performance: {
          accuracy: 0,
          speed: 0,
          successRate: 1.0,
          usageCount: 0,
          lastUsed: new Date(),
          averageDuration: 0,
        },
        status: 'proposed',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId,
      };

      const proposal: SkillProposalType = {
        skill,
        reasoning: `Detected pattern with frequency ${pattern.frequency} and confidence ${pattern.confidence}. This skill would automate ${pattern.examples.length} similar tasks.`,
        expectedBenefit: `Reduce manual effort by automating ${pattern.frequency} repeated tasks with ${Math.round(pattern.confidence * 100)}% confidence.`,
        confidence: pattern.confidence,
        examples: pattern.examples,
      };

      return proposal;
    } catch (error) {
      console.error('Failed to generate skill proposal:', error);
      return null;
    }
  }

  private generateSkillName(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 50);
  }

  private extractCodeFromResponse(response: string): string | null {
    // Extract code from markdown code blocks
    const codeBlockMatch = response.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // If no code block, try to extract any code-like content
    const lines = response.split('\n');
    const codeLines: string[] = [];
    let inCode = false;

    for (const line of lines) {
      if (line.includes('function') || line.includes('const') || line.includes('async')) {
        inCode = true;
      }
      if (inCode) {
        codeLines.push(line);
      }
      if (inCode && line.trim().endsWith('}')) {
        inCode = false;
      }
    }

    return codeLines.length > 0 ? codeLines.join('\n') : null;
  }

  private extractParametersFromCode(code: string): SkillParameter[] {
    const parameters: SkillParameter[] = [];

    // Extract function parameters
    const functionMatch = code.match(/(?:function|const)\s+\w+\s*\(([^)]*)\)/);
    if (functionMatch) {
      const params = functionMatch[1].split(',').map(p => p.trim());
      
      for (const param of params) {
        const [name, type] = param.split(':').map(p => p.trim());
        if (name && !name.startsWith('{')) {
          parameters.push({
            name,
            type: this.mapTypeScriptType(type || 'any'),
            required: !param.includes('='),
            description: `Parameter ${name}`,
          });
        }
      }
    }

    return parameters;
  }

  private mapTypeScriptType(tsType: string): 'string' | 'number' | 'boolean' | 'object' | 'array' {
    const type = tsType.toLowerCase();
    if (type.includes('string')) return 'string';
    if (type.includes('number')) return 'number';
    if (type.includes('boolean')) return 'boolean';
    if (type.includes('array')) return 'array';
    return 'object';
  }

  private async executeSkillCode(_code: string, parameters: Record<string, any>): Promise<any> {
    // In production, this would execute in a sandboxed environment
    // For now, return a mock result
    return {
      executed: true,
      parameters,
      timestamp: new Date(),
    };
  }
}

// Singleton instance
export const skillProposal = new SkillProposalManager();
