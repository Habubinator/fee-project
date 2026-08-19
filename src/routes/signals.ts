import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const grouped = await prisma.subscription.groupBy({
      by: ['serviceName', 'status'],
      _count: { id: true },
    });

    const byService = new Map<
      string,
      { service: string; subscribers: number; cancelled: number; trials: number }
    >();

    for (const row of grouped) {
      const current = byService.get(row.serviceName) ?? {
        service: row.serviceName,
        subscribers: 0,
        cancelled: 0,
        trials: 0,
      };
      current.subscribers += row._count.id;
      if (row.status === 'CANCELLED') current.cancelled += row._count.id;
      if (row.status === 'TRIAL') current.trials += row._count.id;
      byService.set(row.serviceName, current);
    }

    res.json({
      generatedAt: new Date().toISOString(),
      signals: [...byService.values()].map((row) => ({
        service: row.service,
        subscribers: row.subscribers,
        trialShare: row.subscribers ? row.trials / row.subscribers : 0,
        cancelShare: row.subscribers ? row.cancelled / row.subscribers : 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
