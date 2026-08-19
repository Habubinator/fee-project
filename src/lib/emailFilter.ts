import { prisma } from './prisma';

const BILLING_DOMAINS = new Set([
  // Payment processors
  'paypal.com', 'stripe.com', 'braintree.com', 'recurly.com', 'chargebee.com',
  'zuora.com', 'paddle.com', 'fastspring.com', 'gumroad.com', 'lemonsqueezy.com',
  // Big tech
  'apple.com', 'google.com', 'microsoft.com', 'amazon.com', 'amazon.co.uk',
  // Streaming
  'netflix.com', 'spotify.com', 'hulu.com', 'disneyplus.com', 'hbomax.com',
  'max.com', 'youtube.com', 'twitch.tv', 'crunchyroll.com',
  // SaaS productivity
  'github.com', 'dropbox.com', 'slack.com', 'zoom.us', 'notion.so', 'figma.com',
  'atlassian.com', 'monday.com', 'asana.com', 'clickup.com', 'linear.app',
  'airtable.com', 'coda.io', 'miro.com',
  // Cloud / dev infra
  'digitalocean.com', 'amazonaws.com', 'heroku.com', 'cloudflare.com',
  'vercel.com', 'netlify.com', 'railway.app', 'render.com', 'fly.io',
  'datadog.com', 'newrelic.com', 'sentry.io', 'logrocket.com', 'pagerduty.com',
  // Security / auth
  '1password.com', 'lastpass.com', 'dashlane.com', 'nordpass.com', 'bitwarden.com',
  'nordvpn.com', 'expressvpn.com',
  // Design / creative
  'adobe.com', 'canva.com', 'sketch.com', 'invisionapp.com',
  // CRM / marketing
  'hubspot.com', 'salesforce.com', 'zendesk.com', 'intercom.io',
  'mailchimp.com', 'convertkit.com', 'beehiiv.com', 'substack.com',
  // Social / comms
  'linkedin.com', 'twitter.com', 'x.com',
  // Misc
  'grammarly.com', 'duolingo.com', 'coursera.org', 'udemy.com',
  'squarespace.com', 'wix.com', 'wordpress.com', 'webflow.com',
  'shopify.com', 'sendgrid.com', 'twilio.com',
  'jetbrains.com', 'setapp.com',
]);

const SUBJECT_RE =
  /receipt|invoice|renewal|billing|trial.{0,5}end|subscription|payment\s+confirm|charge|order\s+confirm|your\s+plan/i;

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  body: string;
}

function extractDomain(from: string): string {
  const match = from.match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : '';
}

function isKnownBillingDomain(domain: string): boolean {
  if (BILLING_DOMAINS.has(domain)) return true;
  // Check parent domains (e.g. billing.netflix.com → netflix.com)
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (BILLING_DOMAINS.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

export async function passesFilter(userId: string, msg: EmailMessage): Promise<boolean> {
  // Known billing sender
  const domain = extractDomain(msg.from);
  if (!domain || !isKnownBillingDomain(domain)) return false;

  // Subject looks like a receipt / billing mail
  if (!SUBJECT_RE.test(msg.subject)) return false;

  // Skip messages we already ingested
  const existing = await prisma.emailEvent.findUnique({
    where: { gmailMessageId: msg.id },
  });
  return existing === null;
}
