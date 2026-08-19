import { Request, Response, NextFunction } from 'express';
import * as webhookService from '../services/webhook.service';

export async function gmailPush(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const message = (req.body as Record<string, unknown>)?.message as
            | { data?: string; messageId?: string }
            | undefined;
        await webhookService.processGmailPush(req.query['token'], message);
        res.status(204).send();
    } catch (err) { next(err); }
}

export async function monobankWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    const rawBody = req.body as Buffer;
    const xSign   = req.headers['x-sign'] as string | undefined;

    if (!xSign || !Buffer.isBuffer(rawBody)) {
        res.status(400).json({ error: 'Missing signature or body' });
        return;
    }

    try {
        await webhookService.processMonobankWebhook(rawBody, xSign);
        res.status(200).send();
    } catch (err) { next(err); }
}
