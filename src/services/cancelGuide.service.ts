import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { generateCancelGuide, CancelGuideData } from '../lib/cancelGuideGenerator';
import { NotFoundError } from '../lib/errors';

const REDIS_TTL_SECONDS = 86_400;       // 24h response cache
const DB_VALIDITY_MS    = 30 * 86_400_000; // 30 days

function cacheKey(serviceId: string): string {
    return `cancel-guide:${serviceId}`;
}

export async function getCancelGuide(slug: string): Promise<CancelGuideData & { serviceId: string }> {
    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) throw new NotFoundError('Service not found');

    const { id: serviceId } = service;

    // Redis cache
    const cached = await redis.get(cacheKey(serviceId));
    if (cached) {
        return { ...JSON.parse(cached) as CancelGuideData, serviceId };
    }

    // Existing guide in DB
    const existing = await prisma.cancelGuide.findUnique({ where: { serviceId } });
    const isFresh  = existing && (Date.now() - existing.generatedAt.getTime() < DB_VALIDITY_MS);

    if (existing && isFresh) {
        const data: CancelGuideData = {
            steps:             existing.steps as string[],
            cancel_url:        existing.cancelUrl,
            platform:          existing.platform as CancelGuideData['platform'],
            difficulty_score:  existing.difficultyScore,
            dark_patterns:     existing.darkPatterns as string[],
            estimated_minutes: existing.estimatedMinutes,
        };
        await redis.set(cacheKey(serviceId), JSON.stringify(data), 'EX', REDIS_TTL_SECONDS);
        return { ...data, serviceId };
    }

    // Generate a new guide when the stored one is stale
    const knownCancelUrl = await prisma.subscription.findFirst({
        where:   { serviceId, cancelUrl: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select:  { cancelUrl: true },
    }).then(s => s?.cancelUrl ?? null);

    const guide = await generateCancelGuide(service.name, service.pricingUrl, knownCancelUrl);

    // Persist
    await prisma.cancelGuide.upsert({
        where:  { serviceId },
        create: {
            serviceId,
            steps:            guide.steps,
            cancelUrl:        guide.cancel_url,
            platform:         guide.platform,
            difficultyScore:  guide.difficulty_score,
            darkPatterns:     guide.dark_patterns,
            estimatedMinutes: guide.estimated_minutes,
            reviewNeeded:     guide.difficulty_score >= 7,
        },
        update: {
            steps:            guide.steps,
            cancelUrl:        guide.cancel_url,
            platform:         guide.platform,
            difficultyScore:  guide.difficulty_score,
            darkPatterns:     guide.dark_patterns,
            estimatedMinutes: guide.estimated_minutes,
            reviewNeeded:     guide.difficulty_score >= 7,
            generatedAt:      new Date(),
        },
    });

    // Refresh Redis
    await redis.set(cacheKey(serviceId), JSON.stringify(guide), 'EX', REDIS_TTL_SECONDS);

    return { ...guide, serviceId };
}
