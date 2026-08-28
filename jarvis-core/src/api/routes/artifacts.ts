import { Router, Request, Response } from 'express';
import { myAIDocs } from '../../index.js';

const router: Router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, createdBy, tags } = req.query;
    const artifacts = await myAIDocs.listArtifacts({
      type: type as string,
      createdBy: createdBy as string,
      tags: tags ? String(tags).split(',') : undefined,
    });
    res.json(artifacts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, type, content, createdBy, tags, organizationId } = req.body;
    if (!name || !type || !content) {
      return res.status(400).json({ error: 'name, type, and content are required' });
    }
    const id = await myAIDocs.createArtifact({
      name, type, content, createdBy: createdBy || 'api-user',
      tags: tags || [], organizationId, metadata: {},
    } as any);
    res.status(201).json({ id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const artifact = await myAIDocs.getArtifact(req.params.id as any);
    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
    res.json(artifact);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, content, tags } = req.body;
    await myAIDocs.updateArtifact(req.params.id as any, { name, content, tags });
    res.json({ status: 'updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await myAIDocs.deleteArtifact(req.params.id as any);
    res.json({ status: 'deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const versions = await myAIDocs.getArtifactVersions(req.params.id as any);
    res.json(versions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, type, tags } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });
    const results = await myAIDocs.searchArtifacts({ query, filters: { type, tags } });
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
