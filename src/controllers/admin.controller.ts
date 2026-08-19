import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PlanStatus } from '@prisma/client';
import * as adminService from '../services/admin.service';

function parsePage(query: Record<string, unknown>) {
    const page  = Math.max(1, parseInt((query['page']  as string) ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt((query['limit'] as string) ?? '20')));
    return { page, limit };
}

const patchUserSchema = z.object({
    planStatus:    z.nativeEnum(PlanStatus).optional(),
    planExpiresAt: z.string().datetime().optional(),
    isAdmin:       z.boolean().optional(),
});

export async function stats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json(await adminService.getStats()); } catch (err) { next(err); }
}

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { page, limit } = parsePage(req.query as Record<string, unknown>);
    const search = ((req.query['search'] as string) ?? '').trim() || undefined;
    try { res.json(await adminService.listUsers(page, limit, search)); } catch (err) { next(err); }
}

export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json(await adminService.getUserById(req.params['id']!)); } catch (err) { next(err); }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
        return;
    }
    const data: Parameters<typeof adminService.updateUser>[1] = {};
    if (parsed.data.planStatus    !== undefined) data.planStatus    = parsed.data.planStatus;
    if (parsed.data.isAdmin       !== undefined) data.isAdmin       = parsed.data.isAdmin;
    if (parsed.data.planExpiresAt !== undefined) data.planExpiresAt = new Date(parsed.data.planExpiresAt);
    try { res.json(await adminService.updateUser(req.params['id']!, data)); } catch (err) { next(err); }
}

export async function removeUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        await adminService.removeUser(req.params['id']!);
        res.status(204).send();
    } catch (err) { next(err); }
}

export async function listSubscriptions(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { page, limit } = parsePage(req.query as Record<string, unknown>);
    try { res.json(await adminService.listSubscriptions(page, limit)); } catch (err) { next(err); }
}

export async function listEmailEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { page, limit } = parsePage(req.query as Record<string, unknown>);
    try { res.json(await adminService.listEmailEvents(page, limit)); } catch (err) { next(err); }
}
