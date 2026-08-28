import { Router, Request, Response } from 'express';
import { missionCompiler, missionScheduler, missionSupervisor } from '../../index.js';

const router: Router = Router();

// Compile a mission from natural language
router.post('/compile', async (req: Request, res: Response) => {
  try {
    const { instructions, userId } = req.body;
    if (!instructions) {
      return res.status(400).json({ error: 'instructions is required' });
    }
    const mission = await missionCompiler.compileMission(instructions, {}, userId || 'api-user');
    res.json(mission);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Schedule a mission
router.post('/schedule', async (req: Request, res: Response) => {
  try {
    const { mission, delayMs } = req.body;
    if (!mission) {
      return res.status(400).json({ error: 'mission is required' });
    }
    await missionScheduler.scheduleMission(mission, delayMs || 0);
    res.json({ status: 'scheduled', missionId: mission.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get active missions
router.get('/active', async (_req: Request, res: Response) => {
  try {
    const missions = await missionScheduler.getRunning();
    res.json(missions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get mission by ID
router.get('/:missionId', async (req: Request, res: Response) => {
  try {
    const execution = await missionSupervisor.getExecution(req.params.missionId);
    if (!execution) {
      return res.status(404).json({ error: 'Mission not found' });
    }
    res.json(execution);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get scheduler stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await missionScheduler.getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get supervisor stats
router.get('/supervisor/stats', async (_req: Request, res: Response) => {
  try {
    res.json(missionSupervisor.getStats());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
