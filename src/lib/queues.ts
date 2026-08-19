import { Queue } from 'bullmq';
import { redis } from './redis';

const connection = redis;

export const emailSyncQueue    = new Queue('email-sync',    { connection });
export const priceScrapeQueue  = new Queue('price-scrape',  { connection });
export const notificationQueue = new Queue('notifications', { connection });
