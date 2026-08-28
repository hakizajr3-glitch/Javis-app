import { Router, Request, Response } from 'express';
import { aiWorkforce } from '../../index.js';

const router: Router = Router();

// Agents
router.get('/agents', async (_req: Request, res: Response) => {
  try {
    const agents = await aiWorkforce.listAgents();
    res.json(agents);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/agents', async (req: Request, res: Response) => {
  try {
    const { name, type, role, capabilities, organizationId } = req.body;
    if (!name || !role) {
      return res.status(400).json({ error: 'name and role are required' });
    }
    const id = await aiWorkforce.createAgent(name, type || 'ai', role, capabilities || [], organizationId || 'default');
    res.status(201).json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/agents/:id', async (req: Request, res: Response) => {
  try {
    const agent = await aiWorkforce.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/agents/:id/status', async (req: Request, res: Response) => {
  try {
    const { status, currentTask } = req.body;
    await aiWorkforce.updateAgentStatus(req.params.id, status, currentTask);
    res.json({ status: 'updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/agents/:id/performance', async (req: Request, res: Response) => {
  try {
    const agent = await aiWorkforce.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent.performance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Teams
router.get('/teams', async (_req: Request, res: Response) => {
  try {
    const teams = await aiWorkforce.listTeams('default');
    res.json(teams);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/teams', async (req: Request, res: Response) => {
  try {
    const { name, description, leadAgentId, organizationId } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const id = await aiWorkforce.createTeam(name, description || '', leadAgentId, organizationId || 'default');
    res.status(201).json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/teams/:id/members', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.body;
    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }
    await aiWorkforce.addAgentToTeam(req.params.id, agentId);
    res.json({ status: 'added' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Workforce metrics
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const metrics = await aiWorkforce.getMetrics();
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
