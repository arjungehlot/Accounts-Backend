import { Router } from 'express';
import { getClientStatement } from '../controllers/publicController.js';

const router = Router();

// tiny in-memory rate limiter (per IP) — public endpoints must not be brute-forceable
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_HITS = 60;
const limiter = (req, res, next) => {
  const now = Date.now();
  const key = req.ip;
  const rec = hits.get(key) || { count: 0, start: now };
  if (now - rec.start > WINDOW_MS) { rec.count = 0; rec.start = now; }
  rec.count += 1;
  hits.set(key, rec);
  if (rec.count > MAX_HITS) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please try again in a minute.' });
  }
  next();
};
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k); }, WINDOW_MS).unref();

router.get('/client/:token', limiter, getClientStatement);

export default router;
