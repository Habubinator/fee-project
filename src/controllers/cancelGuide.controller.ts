import { Request, Response, NextFunction } from 'express';
import * as cancelGuideService from '../services/cancelGuide.service';

export async function getGuide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        res.json(await cancelGuideService.getCancelGuide(req.params['slug']!));
    } catch (err) {
        next(err);
    }
}
