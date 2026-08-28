import { Router, Request, Response } from 'express';
import { memoryEngine } from '../../index.js';

const router: Router = Router();

// Working memory
router.get('/working/:missionId/:key', async (req: Request, res: Response) => {
  try {
    const value = await memoryEngine.getWorkingMemory(req.params.missionId, req.params.key);
    if (value === null) return res.status(404).json({ error: 'Not found' });
    res.json(value);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/working/:missionId/:key', async (req: Request, res: Response) => {
  try {
    await memoryEngine.setWorkingMemory(req.params.missionId, req.params.key, req.body);
    res.json({ status: 'set' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/working/:missionId/:key', async (req: Request, res: Response) => {
  try {
    await memoryEngine.deleteWorkingMemory(req.params.missionId, req.params.key);
    res.json({ status: 'deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/working/:missionId', async (req: Request, res: Response) => {
  try {
    await memoryEngine.clearWorkingMemory(req.params.missionId);
    res.json({ status: 'cleared' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Organization memory
router.get('/organization/:orgId/:key', async (req: Request, res: Response) => {
  try {
    const value = await memoryEngine.getOrganizationMemory(req.params.orgId, req.params.key);
    if (value === null) return res.status(404).json({ error: 'Not found' });
    res.json(value);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/organization/:orgId/:key', async (req: Request, res: Response) => {
  try {
    await memoryEngine.setOrganizationMemory(req.params.orgId, req.params.key, req.body);
    res.json({ status: 'set' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Personal memory
router.get('/personal/:userId/:key', async (req: Request, res: Response) => {
  try {
    const value = await memoryEngine.getPersonalMemory(req.params.userId, req.params.key);
    if (value === null) return res.status(404).json({ error: 'Not found' });
    res.json(value);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/personal/:userId/:key', async (req: Request, res: Response) => {
  try {
    await memoryEngine.setPersonalMemory(req.params.userId, req.params.key, req.body);
    res.json({ status: 'set' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Search
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, tier } = req.query;
    if (!q) return res.status(400).json({ error: 'q (query) is required' });
    const results = await memoryEngine.searchAllMemory(String(q));
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    res.json(memoryEngine.getStats());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
