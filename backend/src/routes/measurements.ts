import { Router } from 'express';
import { classify, ProductParams } from '../utils/calculator';

export const router = Router();

router.post('/classify', (req, res) => {
  const { weight, params } = req.body as { weight: number; params: ProductParams };
  if (typeof weight !== 'number' || !params) {
    return res.status(400).json({ message: 'Invalid payload' });
  }
  const status = classify(weight, params);
  res.json({ status });
});

// Proxy helper: forward requests to the Spring backend when available
const SPRING_BACKEND = process.env.SPRING_BACKEND_URL || process.env.SPRING_URL || 'http://localhost:8081';

router.get('/yellow-streak', async (req, res) => {
  try {
    const q = new URLSearchParams(req.query as any).toString();
    const target = `${SPRING_BACKEND.replace(/\/$/, '')}/api/measurements/yellow-streak?${q}`;
    if (typeof fetch === 'function') {
      const r = await fetch(target, { headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) return res.status(r.status).send(await r.text().catch(() => ''));
      const j = await r.json().catch(() => null);
      return res.json(j ?? { count: 0, weights: [] });
    }
    return res.json({ count: 0, weights: [] });
  } catch (e) {
    return res.json({ count: 0, weights: [] });
  }
});

router.get('/last', async (req, res) => {
  try {
    const q = new URLSearchParams(req.query as any).toString();
    const target = `${SPRING_BACKEND.replace(/\/$/, '')}/api/measurements/last?${q}`;
    if (typeof fetch === 'function') {
      const r = await fetch(target, { headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) return res.status(r.status).send(await r.text().catch(() => ''));
      const j = await r.json().catch(() => null);
      return res.json(j ?? {});
    }
    return res.json({});
  } catch (e) {
    return res.json({});
  }
});
