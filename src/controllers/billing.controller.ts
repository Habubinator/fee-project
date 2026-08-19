import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as billingService from '../services/billing.service';

export async function checkout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const result = await billingService.createCheckout(req.userId!);
        res.json(result);
    } catch (err) { next(err); }
}
