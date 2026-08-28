import { Router, Request, Response } from 'express';
import { executiveDashboard, eventBus } from '../../index.js';

const router: Router = Router();

router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.json(executiveDashboard.getStats());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/events', async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const events = eventBus.getEventHistory();
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/events/types', async (_req: Request, res: Response) => {
  try {
    res.json(eventBus.getStats());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
