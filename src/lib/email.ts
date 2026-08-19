import { Resend } from 'resend';
import { config } from '../config';

const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;
const FROM = 'App <alerts@app.censored-link.com>';

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured, skipping send:', subject);
    return;
  }
  await resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendWelcome(to: string): Promise<void> {
  await send(
    to,
    'Welcome to App — your 14-day trial has started',
    `<p>Welcome!</p>
     <p>Your 14-day free trial is active. Connect your Gmail to start detecting subscriptions automatically.</p>
     <p><a href="https://app.censored-link.com">Open App →</a></p>`,
  );
}

export async function sendTrialEndingAlert(to: string, daysLeft: number): Promise<void> {
  const plural = daysLeft === 1 ? 'day' : 'days';
  await send(
    to,
    `Your App trial ends in ${daysLeft} ${plural}`,
    `<p>Your free trial ends in <strong>${daysLeft} ${plural}</strong>.</p>
     <p>Upgrade to keep tracking your subscriptions, catching price hikes, and getting cancel guides.</p>
     <p><a href="https://app.censored-link.com">Upgrade now →</a></p>`,
  );
}

export async function sendPriceHikeAlert(
  to: string,
  service: string,
  oldPrice: number,
  newPrice: number,
  currency = 'USD',
): Promise<void> {
  await send(
    to,
    `Price increase detected: ${service}`,
    `<p><strong>${service}</strong> has raised its price.</p>
     <p>Old price: ${oldPrice} ${currency}<br>
        New price: <strong>${newPrice} ${currency}</strong></p>
     <p><a href="https://app.censored-link.com">Review your options →</a></p>`,
  );
}

export async function sendNewSubscriptionDetected(to: string, service: string): Promise<void> {
  await send(
    to,
    `New subscription detected: ${service}`,
    `<p>We found a subscription to <strong>${service}</strong> in your inbox.</p>
     <p><a href="https://app.censored-link.com">View your subscriptions →</a></p>`,
  );
}
