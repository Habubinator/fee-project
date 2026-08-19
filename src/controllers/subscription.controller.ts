import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { SubscriptionStatus } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import * as subscriptionService from '../services/subscription.service';

const patchSchema = z.object({ status: z.nativeEnum(SubscriptionStatus) });

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        res.json(await subscriptionService.listSubscriptions(req.userId!));
    } catch (err) { next(err); }
}

export async function getOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        res.json(await subscriptionService.getSubscription(req.userId!, req.params['id']!));
    } catch (err) { next(err); }
}

export async function update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
        return;
    }
    try {
        res.json(await subscriptionService.updateSubscription(req.userId!, req.params['id']!, parsed.data.status));
    } catch (err) { next(err); }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        await subscriptionService.removeSubscription(req.userId!, req.params['id']!);
        res.status(204).send();
    } catch (err) { next(err); }
}
