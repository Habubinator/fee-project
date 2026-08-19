import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import * as authService from '../services/auth.service';

const registerSchema = z.object({
    email:    z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
    email:    z.string().email(),
    password: z.string().min(1),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
        return;
    }
    try {
        const result = await authService.register(parsed.data.email, parsed.data.password);
        res.status(201).json(result);
    } catch (err) { next(err); }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid input' });
        return;
    }
    try {
        const result = await authService.login(parsed.data.email, parsed.data.password);
        res.json(result);
    } catch (err) { next(err); }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'refreshToken required' });
        return;
    }
    try {
        const result = await authService.refresh(parsed.data.refreshToken);
        res.json(result);
    } catch (err) { next(err); }
}

export async function logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const parsed = refreshSchema.safeParse(req.body);
        await authService.logout(req.userId!, parsed.success ? parsed.data.refreshToken : undefined);
        res.status(204).send();
    } catch (err) { next(err); }
}

export async function getGmailUrl(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const url = await authService.getGmailOAuthUrl(req.userId!);
        res.json({ url });
    } catch (err) { next(err); }
}

export async function gmailCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) {
        if (req.accepts('html')) {
            res.redirect(`/dashboard?gmail=error&reason=${encodeURIComponent(error)}`);
            return;
        }
        res.status(400).json({ error: `Google OAuth error: ${error}` });
        return;
    }
    if (!code || !state) {
        res.status(400).json({ error: 'Missing code or state' });
        return;
    }
    try {
        const result = await authService.handleGmailCallback(code, state);
        if (req.accepts('html')) {
            res.redirect('/dashboard?gmail=connected');
            return;
        }
        res.json(result);
    } catch (err) { next(err); }
}
