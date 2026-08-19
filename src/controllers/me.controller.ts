import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import * as userService from '../services/user.service';

const fcmSchema    = z.object({ fcmToken:  z.string().min(1) });
const deleteSchema = z.object({ password: z.string().min(1) });

export async function getMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        res.json(await userService.getMe(req.userId!));
    } catch (err) { next(err); }
}

export async function updateFcmToken(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    const parsed = fcmSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
        return;
    }
    try {
        await userService.updateFcmToken(req.userId!, parsed.data.fcmToken);
        res.json({ success: true });
    } catch (err) { next(err); }
}

export async function deleteAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    const parsed = deleteSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Password required to confirm account deletion' });
        return;
    }
    try {
        await userService.deleteAccount(req.userId!, parsed.data.password);
        res.status(204).send();
    } catch (err) { next(err); }
}
