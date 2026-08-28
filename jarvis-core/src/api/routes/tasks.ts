import { Router, Request, Response } from 'express';
import { tasksManager } from '../../index.js';

const router: Router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const tasks = await tasksManager.listTasks();
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, description, createdBy, projectId, organizationId, agentId, priority, dueDate, tags } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }
    const id = await tasksManager.createTask(title, description || '', createdBy || 'api-user', projectId, organizationId, agentId, priority || 'medium', dueDate ? new Date(dueDate) : undefined, tags || []);
    res.status(201).json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const task = await tasksManager.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    await tasksManager.updateTask(req.params.id, updates);
    res.json({ status: 'updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await tasksManager.deleteTask(req.params.id);
    res.json({ status: 'deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
