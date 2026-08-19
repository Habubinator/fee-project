import { createVerify } from 'crypto';
import { config } from '../config';
import { redis } from './redis';

const BASE_URL = 'https://api.monobank.ua';
const PUBKEY_CACHE_KEY = 'monobank:pubkey';
const PUBKEY_TTL_SECONDS = 86_400; // 24h

const API_BASE = process.env['API_BASE_URL'] ?? 'https://api.censored-link.com';
const APP_BASE = process.env['APP_BASE_URL'] ?? 'https://app.censored-link.com';

export async function getPubKey(): Promise<string> {
    const cached = await redis.get(PUBKEY_CACHE_KEY);
    if (cached) return cached;

    const res = await fetch(`${BASE_URL}/api/merchant/pubkey`, {
        headers: { 'X-Token': config.MONOBANK_API_TOKEN },
    });
    if (!res.ok) throw new Error(`Monobank pubkey fetch failed: ${res.status}`);
    const data = (await res.json()) as { key: string };
    await redis.set(PUBKEY_CACHE_KEY, data.key, 'EX', PUBKEY_TTL_SECONDS);
    return data.key;
}

export function verifySignature(rawBody: string, xSign: string, pubKey: string): boolean {
    try {
        return createVerify('SHA256').update(rawBody).verify(pubKey, xSign, 'base64');
    } catch {
        return false;
    }
}

export interface InvoiceResult {
    invoiceId: string;
    pageUrl: string;
}

export async function createInvoice(userId: string, amount: number): Promise<InvoiceResult> {
    const res = await fetch(`${BASE_URL}/api/merchant/invoice/create`, {
        method: 'POST',
        headers: {
            'X-Token': config.MONOBANK_API_TOKEN,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            amount,
            ccy: 840, // USD
            merchantPaymInfo: {
                reference: userId,
                destination: 'App annual subscription',
            },
            webHookUrl: `${API_BASE}/v1/webhooks/monobank`,
            redirectUrl: `${APP_BASE}/billing/success`,
            saveCardData: { saveCard: true, walletId: userId },
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Monobank createInvoice failed: ${res.status} ${text}`);
    }

    return res.json() as Promise<InvoiceResult>;
}

export interface RecurringResult {
    invoiceId: string;
    status: string;
}

export async function createRecurringCharge(
    cardToken: string,
    userId: string,
    amount: number,
): Promise<RecurringResult> {
    const res = await fetch(`${BASE_URL}/api/merchant/wallet/payment`, {
        method: 'POST',
        headers: {
            'X-Token': config.MONOBANK_API_TOKEN,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            cardToken,
            amount,
            ccy: 840, // USD
            initiationKind: 'merchant',
            merchantPaymInfo: {
                reference: userId,
                destination: 'App annual subscription renewal',
            },
            webHookUrl: `${API_BASE}/v1/webhooks/monobank`,
            redirectUrl: `${APP_BASE}/billing/success`,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Monobank recurring charge failed: ${res.status} ${text}`);
    }

    return res.json() as Promise<RecurringResult>;
}
