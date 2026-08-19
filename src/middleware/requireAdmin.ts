import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { getIsAdmin } from '../services/user.service';

export async function requireAdmin(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    if (!(await getIsAdmin(req.userId!))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    next();
}
