import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { organizationBuilder } from '../../index.js';

const router: Router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const orgs = await organizationBuilder.listOrganizations();
    res.json(orgs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, type, ownerId } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const id = await organizationBuilder.createOrganization(name, description || '', type || 'team', ownerId || 'api-user');
    res.status(201).json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const org = await organizationBuilder.getOrganization(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/structure', async (req: Request, res: Response) => {
  try {
    const structure = await organizationBuilder.getStructure(req.params.id);
    res.json(structure);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/roles', async (req: Request, res: Response) => {
  try {
    const roles = await organizationBuilder.listRoles(req.params.id);
    res.json(roles);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/roles', async (req: Request, res: Response) => {
  try {
    const { name, description, level, permissions } = req.body;
    const role = { id: uuidv4(), name, description: description || '', level: level || 50, permissions: permissions || [] };
    await organizationBuilder.createRole(req.params.id, role);
    res.status(201).json({ id: role.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/policies', async (req: Request, res: Response) => {
  try {
    const policies = await organizationBuilder.listPolicies(req.params.id);
    res.json(policies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
