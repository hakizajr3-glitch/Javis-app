import { Router, Request, Response } from 'express';
import { eventBus, EventType } from '../../index.js';

const router: Router = Router();

// Get event history with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, source, correlationId, startTime, endTime, limit } = req.query;

    const filter: any = {};
    if (type && Object.values(EventType).includes(type as EventType)) {
      filter.eventType = type as EventType;
    }
    if (source) filter.source = source as string;
    if (correlationId) filter.correlationId = correlationId as string;
    if (startTime) filter.startTime = new Date(startTime as string);
    if (endTime) filter.endTime = new Date(endTime as string);

    let events = eventBus.getEventHistory(filter);

    if (limit) {
      events = events.slice(0, parseInt(limit as string));
    }

    res.json({
      count: events.length,
      events,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get event statistics
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    res.json(eventBus.getStats());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get available event types
router.get('/types', async (_req: Request, res: Response) => {
  try {
    res.json({
      types: Object.values(EventType),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Replay events in a time range
router.post('/replay', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to are required (ISO date strings)' });
    }
    await eventBus.replayEvents(new Date(from), new Date(to));
    res.json({ status: 'replayed', from, to });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
