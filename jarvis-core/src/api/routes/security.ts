import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { securityLayer } from '../../index.js';

const router: Router = Router();

// Audit log
router.get('/audit', async (_req: Request, res: Response) => {
  try {
    const logs = await securityLayer.queryAuditLogs({});
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/audit', async (req: Request, res: Response) => {
  try {
    const { userId, action, resource, riskLevel, details } = req.body;
    await securityLayer.logAuditEvent({
      id: uuidv4(),
      userId, action, resource,
      riskLevel: riskLevel || 'medium',
      details, timestamp: new Date(),
    } as any);
    res.status(201).json({ status: 'logged' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Secrets
router.get('/secrets', async (_req: Request, res: Response) => {
  try {
    const secrets = await securityLayer.listSecrets();
    res.json(secrets);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/secrets', async (req: Request, res: Response) => {
  try {
    const { name, value, type, description, organizationId, createdBy } = req.body;
    const id = await securityLayer.storeSecret({
      name, value, type: type || 'api_key', description,
      organizationId, createdBy: createdBy || 'api-user',
    } as any);
    res.status(201).json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/secrets/:id', async (req: Request, res: Response) => {
  try {
    await securityLayer.deleteSecret(req.params.id as any);
    res.json({ status: 'deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sandboxes
router.post('/sandboxes', async (req: Request, res: Response) => {
  try {
    const id = await securityLayer.createSandbox(req.body);
    res.status(201).json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sandboxes/:id', async (req: Request, res: Response) => {
  try {
    const status = await securityLayer.getSandboxStatus(req.params.id as any);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/sandboxes/:id', async (req: Request, res: Response) => {
  try {
    await securityLayer.destroySandbox(req.params.id as any);
    res.json({ status: 'destroyed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
