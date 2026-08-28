import { Router, Request, Response } from 'express';
import { llmOrchestrator } from '../../index.js';

const router: Router = Router();

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { prompt, model, temperature, maxTokens } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const response = await llmOrchestrator.executeRequest({
      prompt,
      model,
      temperature,
      maxTokens,
    } as any);
    res.json(response);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/providers', async (_req: Request, res: Response) => {
  try {
    const entries: any[] = Array.from((llmOrchestrator as any).providers?.entries?.() || []);
    const providers = entries.map(([k, v]) => ({ provider: k, ...v }));
    res.json(providers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
