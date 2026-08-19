import { Request, Response, NextFunction } from 'express';
import * as priceService from '../services/price.service';

function parsePage(query: Record<string, unknown>) {
    const page  = Math.max(1, parseInt((query['page']  as string) ?? '1'));
    const limit = Math.min(100, Math.max(1, parseInt((query['limit'] as string) ?? '20')));
    return { page, limit };
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { page, limit } = parsePage(req.query as Record<string, unknown>);
    try { res.json(await priceService.listServices(page, limit)); } catch (err) { next(err); }
}

export async function getPricing(req: Request, res: Response, next: NextFunction): Promise<void> {
    const days = Math.min(365, Math.max(1, parseInt((req.query['days'] as string) ?? '30')));
    try { res.json(await priceService.getPricingHistory(req.params['slug']!, days)); } catch (err) { next(err); }
}

export async function getCancelScore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json(await priceService.getCancelScore(req.params['slug']!)); } catch (err) { next(err); }
}

export async function getCompetitors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json(await priceService.getCompetitors(req.params['slug']!)); } catch (err) { next(err); }
}

export async function getTrials(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json(await priceService.getTrialTerms(req.params['slug']!)); } catch (err) { next(err); }
}
