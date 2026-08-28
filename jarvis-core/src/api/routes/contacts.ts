import { Router, Request, Response } from 'express';
import { contactsManager } from '../../index.js';

const router: Router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    if (search) {
      const results = await contactsManager.searchContacts(String(search));
      return res.json(results);
    }
    const contacts = await contactsManager.listContacts();
    res.json(contacts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, createdBy, email, phone, organization, title, avatar, groupId, organizationId, tags, notes } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const id = await contactsManager.createContact(name, createdBy || 'api-user', email, phone, organization, title, avatar, groupId, organizationId, tags || [], notes);
    res.status(201).json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const contact = await contactsManager.getContact(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    await contactsManager.updateContact(req.params.id, updates);
    res.json({ status: 'updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await contactsManager.deleteContact(req.params.id);
    res.json({ status: 'deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
