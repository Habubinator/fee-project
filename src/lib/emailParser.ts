import OpenAI from 'openai';
import { config } from '../config';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

export interface ParsedSubscription {
  service_name: string;
  price: number | null;
  currency: string;
  renewal_date: string | null;
  trial_status: boolean;
  cancel_url: string | null;
}

const SYSTEM_PROMPT = `You extract subscription billing information from emails.
Return ONLY a JSON object with these exact fields (no extra keys):
- service_name: string — the company or service name (e.g. "Netflix", "Spotify", "GitHub")
- price: number or null — the numeric amount charged or due (e.g. 9.99, 12.00)
- currency: string — 3-letter ISO 4217 code (e.g. "USD", "EUR", "GBP"); default "USD" if unclear
- renewal_date: string or null — ISO 8601 date of next charge, renewal, or trial end (e.g. "2024-03-15"); null if not found
- trial_status: boolean — true only if this email explicitly mentions a trial period or trial ending
- cancel_url: string or null — a direct cancellation URL found in the email body; null if not present`;

export async function parseEmail(
  subject: string,
  body: string,
): Promise<ParsedSubscription> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Subject: ${subject}\n\nBody:\n${body.slice(0, 4000)}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';

  let parsed: Partial<ParsedSubscription>;
  try {
    parsed = JSON.parse(raw) as Partial<ParsedSubscription>;
  } catch {
    parsed = {};
  }

  return {
    service_name: typeof parsed.service_name === 'string' ? parsed.service_name : 'Unknown Service',
    price: typeof parsed.price === 'number' ? parsed.price : null,
    currency: typeof parsed.currency === 'string' ? parsed.currency.toUpperCase() : 'USD',
    renewal_date: typeof parsed.renewal_date === 'string' ? parsed.renewal_date : null,
    trial_status: parsed.trial_status === true,
    cancel_url: typeof parsed.cancel_url === 'string' ? parsed.cancel_url : null,
  };
}
