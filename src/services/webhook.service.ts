import { emailSyncQueue } from '../jobs';
import { config } from '../config';
import { getPubKey, verifySignature } from '../lib/monobank';
import { prisma } from '../lib/prisma';
import { BadRequestError, ForbiddenError, HttpError } from '../lib/errors';

export async function processGmailPush(
    token: unknown,
    message: { data?: string; messageId?: string } | undefined,
): Promise<void> {
    if (!config.PUBSUB_VERIFY_TOKEN || token !== config.PUBSUB_VERIFY_TOKEN) {
        throw new ForbiddenError();
    }

    if (!message?.data) return;

    let notification: { emailAddress?: string; historyId?: string };
    try {
        const decoded = Buffer.from(message.data, 'base64').toString('utf-8');
        notification = JSON.parse(decoded) as { emailAddress?: string; historyId?: string };
    } catch {
        return;
    }

    const { emailAddress, historyId } = notification;
    if (!emailAddress || !historyId) return;

    const user = await prisma.user.findUnique({
        where:  { email: emailAddress },
        select: { id: true, gmailHistoryId: true },
    });
    if (!user) return;

    await emailSyncQueue.add('process-history', {
        userId:         user.id,
        historyId,
        startHistoryId: user.gmailHistoryId ?? historyId,
    });

    await prisma.user.update({
        where: { id: user.id },
        data:  { gmailHistoryId: historyId },
    });
}

export async function processMonobankWebhook(rawBody: Buffer, xSign: string): Promise<void> {
    let pubKey: string;
    try {
        pubKey = await getPubKey();
    } catch (err) {
        console.error('Monobank pubkey fetch error:', err);
        throw new HttpError(502, 'Could not fetch signing key');
    }

    const bodyStr = rawBody.toString('utf-8');
    if (!verifySignature(bodyStr, xSign, pubKey)) {
        throw new ForbiddenError('Invalid signature');
    }

    interface WebhookPayload {
        status?:            string;
        merchantPaymInfo?:  { reference?: string };
        paymentInfo?:       { cardToken?: string };
    }

    let payload: WebhookPayload;
    try {
        payload = JSON.parse(bodyStr) as WebhookPayload;
    } catch {
        throw new BadRequestError('Invalid JSON');
    }

    if (payload.status !== 'success') return;

    const userId = payload.merchantPaymInfo?.reference;
    if (!userId) return;

    const planExpiresAt = new Date();
    planExpiresAt.setFullYear(planExpiresAt.getFullYear() + 1);

    await prisma.user.update({
        where: { id: userId },
        data: {
            planStatus: 'ACTIVE',
            planExpiresAt,
            ...(payload.paymentInfo?.cardToken ? { monoCardToken: payload.paymentInfo.cardToken } : {}),
        },
    });
}
