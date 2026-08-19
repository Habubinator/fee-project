import OpenAI from 'openai';
import { config } from '../config';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

export interface PriceTier {
    plan:     string;
    price:    number;
    currency: string;
    interval: string; // "month" | "year"
}

function stripHtml(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const SYSTEM_PROMPT = `You extract subscription pricing tiers from web page text.
Return ONLY a JSON object with a single "tiers" array. Each tier must have:
- plan: string — tier name (e.g. "Individual", "Family", "Pro", "Basic", "Premium")
- price: number — the numeric price (no currency symbols)
- currency: string — ISO 4217 code (e.g. "USD", "EUR", "GBP")
- interval: string — exactly "month" or "year"

Rules:
- If a plan has both monthly and yearly pricing, include both as separate entries.
- Only include plans with a real numeric price — skip "Contact us" or "Enterprise" tiers.
- Default currency to "USD" if ambiguous.
- Return an empty tiers array if no pricing data is found.`;

export async function parsePricing(_url: string, html: string): Promise<PriceTier[]> {
    const text = stripHtml(html).slice(0, 6_000);

    try {
        const completion = await openai.chat.completions.create({
            model:           'gpt-4o',
            response_format: { type: 'json_object' },
            temperature:     0,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user',   content: text },
            ],
        });

        const raw    = completion.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(raw) as { tiers?: unknown[] };
        const tiers  = Array.isArray(parsed.tiers) ? parsed.tiers : [];

        return tiers.filter((t): t is PriceTier =>
            typeof (t as PriceTier).plan     === 'string' &&
            typeof (t as PriceTier).price    === 'number' &&
            typeof (t as PriceTier).currency === 'string' &&
            typeof (t as PriceTier).interval === 'string',
        );
    } catch {
        return [];
    }
}
