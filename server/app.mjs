import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validatePlanRequest } from './validate.mjs';
import { planFixture } from './planner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'fixture-planner', time: new Date().toISOString() });
  });

  app.post('/api/fixture-plans', (req, res, next) => {
    try {
      const input = validatePlanRequest(req.body);
      const result = planFixture(input);
      res.json({ ok: true, result });
    } catch (err) {
      next(err);
    }
  });

  app.use(express.static(join(__dirname, '..', 'public')));

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return res
        .status(404)
        .json({ ok: false, error: { code: 'NOT_FOUND', message: `无此接口: ${req.path}` } });
    }
    res.status(404).send('Not found');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status === 400) {
      return res.status(400).json({
        ok: false,
        error: { code: err.code || 'BAD_REQUEST', message: err.message, details: err.details },
      });
    }
    console.error('[fixture-planner] internal error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '服务内部错误' } });
  });

  return app;
}
