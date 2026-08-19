import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';
import { isFullAccess } from '../lib/plan';

export async function requirePlan(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const user = await prisma.user.findUnique({
        where:  { id: req.userId! },
        select: { planStatus: true, trialEndsAt: true, planExpiresAt: true },
    });

    if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const allowed = isFullAccess(user.planStatus, user.trialEndsAt, user.planExpiresAt);

    if (!allowed) {
        res.status(402).json({ error: 'Active subscription required', upgradeUrl: '/v1/billing/checkout' });
        return;
    }

    next();
}
