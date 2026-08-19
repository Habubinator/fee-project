import OpenAI from 'openai';
import { config } from '../config';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

export interface CancelGuideData {
    steps:             string[];
    cancel_url:        string | null;
    platform:          'web' | 'mobile' | 'phone';
    difficulty_score:  number;
    dark_patterns:     string[];
    estimated_minutes: number;
}

const SYSTEM_PROMPT = `You are an expert at navigating subscription cancellation flows.
Return ONLY a JSON object with these exact fields (no extra keys):
- steps: string[] — ordered list of steps to cancel the subscription (be specific, e.g. "Go to Account Settings > Membership > Cancel")
- cancel_url: string or null — the direct URL to the cancellation page, if known; null otherwise
- platform: "web" | "mobile" | "phone" — primary cancellation method required
- difficulty_score: number — integer 1–10 (1 = one click, 10 = requires phone call + retention flow)
- dark_patterns: string[] — list of dark patterns used (e.g. "Requires phone call", "Hidden cancel button", "Retention pop-up with confusing wording"); empty array if none
- estimated_minutes: number — realistic minutes needed to complete cancellation`;

export async function generateCancelGuide(
    serviceName: string,
    pricingUrl: string,
    knownCancelUrl?: string | null,
): Promise<CancelGuideData> {
    const userMessage = knownCancelUrl
        ? `Service: ${serviceName}\nPricing page: ${pricingUrl}\nKnown cancellation URL (may be outdated): ${knownCancelUrl}`
        : `Service: ${serviceName}\nPricing page: ${pricingUrl}`;

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            response_format: { type: 'json_object' },
            temperature: 0,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user',   content: userMessage },
            ],
        });

        const raw = completion.choices[0]?.message?.content ?? '{}';

        let parsed: Partial<CancelGuideData>;
        try {
            parsed = JSON.parse(raw) as Partial<CancelGuideData>;
        } catch {
            parsed = {};
        }

        return {
            steps:             Array.isArray(parsed.steps) ? parsed.steps.filter(s => typeof s === 'string') : [],
            cancel_url:        typeof parsed.cancel_url === 'string' ? parsed.cancel_url : null,
            platform:          parsed.platform === 'mobile' || parsed.platform === 'phone' ? parsed.platform : 'web',
            difficulty_score:  typeof parsed.difficulty_score === 'number' ? Math.min(10, Math.max(1, Math.round(parsed.difficulty_score))) : 5,
            dark_patterns:     Array.isArray(parsed.dark_patterns) ? parsed.dark_patterns.filter(p => typeof p === 'string') : [],
            estimated_minutes: typeof parsed.estimated_minutes === 'number' ? Math.max(1, parsed.estimated_minutes) : 5,
        };
    } catch {
        return {
            steps:             [],
            cancel_url:        null,
            platform:          'web',
            difficulty_score:  5,
            dark_patterns:     [],
            estimated_minutes: 5,
        };
    }
}
