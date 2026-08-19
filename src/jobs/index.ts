import { Worker } from 'bullmq';
import { google } from 'googleapis';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { passesFilter, EmailMessage } from '../lib/emailFilter';
import { parseEmail } from '../lib/emailParser';
import { emailSyncQueue, priceScrapeQueue, notificationQueue } from '../lib/queues';
import * as priceService from '../services/price.service';
import * as notificationService from '../services/notification.service';
import { sendPush } from '../lib/firebase';
import { config } from '../config';

export { emailSyncQueue, priceScrapeQueue, notificationQueue };

const connection = redis;

// Helpers

function makeGmailClient(accessToken: string, refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI,
  );
  oauth2Client.setCredentials({
    access_token:  accessToken,
    refresh_token: refreshToken,
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function decodeBody(parts: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: unknown[] | null }[] | null | undefined): string {
  if (!parts) return '';
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
  }
  for (const part of parts) {
    if (part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
  }
  return '';
}

function extractHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

async function processMessage(
  userId: string,
  gmail: ReturnType<typeof google.gmail>,
  messageId: string,
): Promise<void> {
  const { data: msg } = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = msg.payload?.headers ?? [];
  const subject  = extractHeader(headers, 'subject');
  const from     = extractHeader(headers, 'from');
  const snippet  = msg.snippet ?? '';
  const body     = decodeBody(msg.payload?.parts ?? null) || snippet;

  const email: EmailMessage = { id: messageId, subject, from, snippet, body };

  const passes = await passesFilter(userId, email);
  if (!passes) return;

  const parsed = await parseEmail(subject, body);

  const renewalDate = parsed.renewal_date ? new Date(parsed.renewal_date) : null;

  await prisma.subscription.upsert({
    where: { gmailMessageId: messageId },
    create: {
      userId,
      serviceName:    parsed.service_name,
      price:          parsed.price ?? undefined,
      currency:       parsed.currency,
      renewalDate:    renewalDate ?? undefined,
      trialStatus:    parsed.trial_status,
      trialEndsAt:    parsed.trial_status && renewalDate ? renewalDate : undefined,
      cancelUrl:      parsed.cancel_url ?? undefined,
      status:         parsed.trial_status ? 'TRIAL' : 'ACTIVE',
      gmailMessageId: messageId,
    },
    update: {
      price:       parsed.price ?? undefined,
      currency:    parsed.currency,
      renewalDate: renewalDate ?? undefined,
      trialStatus: parsed.trial_status,
      status:      parsed.trial_status ? 'TRIAL' : 'ACTIVE',
      cancelUrl:   parsed.cancel_url ?? undefined,
    },
  });

  const senderDomain = from.match(/@([\w.-]+)/)?.[1] ?? null;

  await prisma.emailEvent.create({
    data: {
      userId,
      gmailMessageId: messageId,
      subject,
      senderDomain,
    },
  });

  // Link subscription to canonical Service record if a match is found
  const serviceId = await priceService.findOrLinkService(parsed.service_name, senderDomain ?? undefined);
  if (serviceId) {
    await prisma.subscription.update({
      where: { gmailMessageId: messageId },
      data:  { serviceId },
    });
  }
}

// Workers

export function startWorkers(): void {
  new Worker(
    'email-sync',
    async (job) => {
      const { userId } = job.data as { userId: string };

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { gmailAccessToken: true, gmailRefreshToken: true },
      });

      if (!user?.gmailAccessToken || !user.gmailRefreshToken) {
        console.warn('[worker:email-sync] user has no Gmail tokens:', userId);
        return;
      }

      const gmail = makeGmailClient(user.gmailAccessToken, user.gmailRefreshToken);

      if (job.name === 'historical-sync') {
        const after = Math.floor((Date.now() - 365 * 86_400_000) / 1000);
        const query = `after:${after} (subject:receipt OR subject:invoice OR subject:renewal OR subject:billing OR subject:subscription OR subject:payment OR subject:"trial ending")`;

        let pageToken: string | undefined;
        do {
          const { data } = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 50,
            pageToken,
          });

          const messages = data.messages ?? [];
          for (const m of messages) {
            if (!m.id) continue;
            try {
              await processMessage(userId, gmail, m.id);
            } catch (err) {
              console.error(`[worker:email-sync] failed to process message ${m.id}:`, err);
            }
          }

          pageToken = data.nextPageToken ?? undefined;
        } while (pageToken);

        console.log(`[worker:email-sync] historical-sync complete for user ${userId}`);

      } else if (job.name === 'process-history') {
        const { historyId, startHistoryId } = job.data as {
          historyId: string;
          startHistoryId: string;
        };

        const { data } = await gmail.users.history.list({
          userId: 'me',
          startHistoryId,
          historyTypes: ['messageAdded'],
        });

        const addedMessages = (data.history ?? [])
          .flatMap(h => h.messagesAdded ?? [])
          .map(ma => ma.message)
          .filter((m): m is NonNullable<typeof m> => !!m?.id);

        for (const m of addedMessages) {
          try {
            await processMessage(userId, gmail, m.id!);
          } catch (err) {
            console.error(`[worker:email-sync] failed to process message ${m.id}:`, err);
          }
        }

        await prisma.user.update({
          where: { id: userId },
          data: { gmailHistoryId: historyId },
        });
      }
    },
    { connection },
  );

  new Worker('price-scrape', async (job) => {
    try {
      if (job.name === 'scrape-service') {
        const { serviceId } = job.data as { serviceId: string };
        const { changed, oldTiers, newTiers } = await priceService.scrapeAndRecord(serviceId);
        if (changed) {
          await notificationService.queuePriceHikeAlerts(serviceId, oldTiers, newTiers);
        }
      } else if (job.name === 'enqueue-scrapes') {
        const services = await prisma.service.findMany({ select: { id: true } });
        for (const s of services) {
          await priceScrapeQueue.add('scrape-service', { serviceId: s.id }, {
            delay: Math.floor(Math.random() * 3_600_000),
          });
        }
      }
    } catch (err) {
      console.error(`[worker:price-scrape] job ${job.name} ${job.id} failed:`, err);
      throw err;
    }
  }, { connection });

  new Worker('notifications', async (job) => {
    if (job.name === 'schedule-alerts') {
      await notificationService.scheduleUpcomingAlerts();
      return;
    }

    const { userId } = job.data as { userId: string };
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { fcmToken: true },
    });
    if (!user?.fcmToken) return;

    if (job.name === 'price-hike') {
      const { serviceId } = job.data as { serviceId: string };
      const service = await prisma.service.findUnique({
        where: { id: serviceId }, select: { name: true },
      });
      const name = service?.name ?? 'A service you use';
      await sendPush(user.fcmToken, 'Price increase detected', `${name} has raised its subscription price.`, { serviceId });

    } else if (job.name === 'trial-ending') {
      const { serviceName, daysLeft } = job.data as { serviceName: string; daysLeft: number };
      await sendPush(user.fcmToken, 'Trial ending soon', `Your ${serviceName} trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`);

    } else if (job.name === 'renewal-alert') {
      const { serviceName, price, currency } = job.data as { serviceName: string; price: number | null; currency: string };
      const amount = price != null ? ` (${currency} ${price.toFixed(2)})` : '';
      await sendPush(user.fcmToken, 'Renewal coming up', `${serviceName} renews in 5 days${amount}.`);
    }
  }, { connection });

  // Daily 02:00 UTC scrape enqueue (jobId keeps it from duplicating)
  void priceScrapeQueue.add('enqueue-scrapes', {}, {
    repeat: { pattern: '0 2 * * *' },
    jobId: 'daily-enqueue-scrapes',
  });

  // Daily 08:00 UTC trial / renewal alerts
  void notificationQueue.add('schedule-alerts', {}, {
    repeat: { pattern: '0 8 * * *' },
    jobId: 'daily-schedule-alerts',
  });

  console.log('[jobs] workers started');
}
