import { Router, Request, Response } from 'express';
import { notesManager } from '../../index.js';

const router: Router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const notes = await notesManager.listNotes();
    res.json(notes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, content, createdBy, notebookId, organizationId, tags } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }
    const id = await notesManager.createNote(title, content, createdBy || 'api-user', notebookId, organizationId, tags || []);
    res.status(201).json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const note = await notesManager.getNote(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { title, content, tags } = req.body;
    await notesManager.updateNote(req.params.id, { title, content, tags });
    res.json({ status: 'updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await notesManager.deleteNote(req.params.id);
    res.json({ status: 'deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
