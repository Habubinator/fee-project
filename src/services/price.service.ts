import { PriceSnapshot } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { fetchRenderedHtml } from '../lib/scraper';
import { parsePricing, PriceTier } from '../lib/priceParser';
import { NotFoundError } from '../lib/errors';

export type { PriceTier };

export interface HistoryResult {
    service: {
        id:         string;
        name:       string;
        slug:       string;
        domain:     string | null;
        pricingUrl: string;
        logoUrl:    string | null;
    };
    snapshots: PriceSnapshot[];
}

export interface ListResult {
    services: {
        id:         string;
        name:       string;
        slug:       string;
        domain:     string | null;
        pricingUrl: string;
        logoUrl:    string | null;
    }[];
    total: number;
    page:  number;
    pages: number;
}

export async function getLatestTiers(serviceId: string): Promise<PriceSnapshot[]> {
    const snapshots = await prisma.priceSnapshot.findMany({
        where:   { serviceId },
        orderBy: { capturedAt: 'desc' },
    });

    const seen    = new Set<string>();
    const latest: PriceSnapshot[] = [];
    for (const snap of snapshots) {
        const key = `${snap.plan}:${snap.interval}`;
        if (!seen.has(key)) {
            seen.add(key);
            latest.push(snap);
        }
    }
    return latest;
}

export async function scrapeAndRecord(serviceId: string): Promise<{
    changed:  boolean;
    oldTiers: PriceTier[];
    newTiers: PriceTier[];
}> {
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new NotFoundError('Service not found');

    const html     = await fetchRenderedHtml(service.pricingUrl);
    const newTiers = await parsePricing(service.pricingUrl, html);

    if (newTiers.length === 0) return { changed: false, oldTiers: [], newTiers: [] };

    const latestSnaps = await getLatestTiers(serviceId);
    const oldTiers: PriceTier[] = latestSnaps.map(s => ({
        plan: s.plan, price: s.price, currency: s.currency, interval: s.interval,
    }));

    const hasChange = newTiers.some(newTier => {
        const old = oldTiers.find(t => t.plan === newTier.plan && t.interval === newTier.interval);
        if (!old) return true;
        return Math.abs(newTier.price - old.price) / old.price > 0.01;
    });

    if (!hasChange) return { changed: false, oldTiers, newTiers };

    await prisma.priceSnapshot.createMany({
        data: newTiers.map(tier => ({
            serviceId,
            plan:     tier.plan,
            price:    tier.price,
            currency: tier.currency,
            interval: tier.interval,
        })),
    });

    return { changed: true, oldTiers, newTiers };
}

export async function getPricingHistory(slug: string, days = 30): Promise<HistoryResult> {
    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) throw new NotFoundError('Service not found');

    const since     = new Date(Date.now() - days * 86_400_000);
    const snapshots = await prisma.priceSnapshot.findMany({
        where:   { serviceId: service.id, capturedAt: { gte: since } },
        orderBy: { capturedAt: 'asc' },
    });

    return { service, snapshots };
}

export async function listServices(page: number, limit: number): Promise<ListResult> {
    const skip = (page - 1) * limit;
    const [services, total] = await Promise.all([
        prisma.service.findMany({
            skip,
            take:    limit,
            orderBy: { name: 'asc' },
            select: { id: true, name: true, slug: true, domain: true, pricingUrl: true, logoUrl: true },
        }),
        prisma.service.count(),
    ]);
    return { services, total, page, pages: Math.ceil(total / limit) };
}

export async function findOrLinkService(
    serviceName: string,
    senderDomain?: string | null,
): Promise<string | null> {
    if (senderDomain) {
        const parts        = senderDomain.split('.');
        const parentDomain = parts.length > 2 ? parts.slice(-2).join('.') : senderDomain;
        const candidates   = [...new Set([senderDomain, parentDomain])];

        for (const domain of candidates) {
            const service = await prisma.service.findFirst({ where: { domain } });
            if (service) return service.id;
        }
    }

    const service = await prisma.service.findFirst({
        where: { name: { equals: serviceName, mode: 'insensitive' } },
    });
    return service?.id ?? null;
}

export async function getCancelScore(slug: string) {
    const service = await prisma.service.findUnique({
        where: { slug },
        include: { cancelGuide: true },
    });
    if (!service) throw new NotFoundError('Service not found');
    const guide = service.cancelGuide;
    return {
        service: { id: service.id, name: service.name, slug: service.slug },
        difficultyScore: guide?.difficultyScore ?? null,
        darkPatterns: (guide?.darkPatterns as string[] | null) ?? [],
        estimatedMinutes: guide?.estimatedMinutes ?? null,
        platform: guide?.platform ?? null,
    };
}

export async function getCompetitors(slug: string) {
    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) throw new NotFoundError('Service not found');

    const others = await prisma.service.findMany({
        where: { slug: { not: slug } },
        take: 8,
        orderBy: { name: 'asc' },
        include: {
            priceSnapshots: { orderBy: { capturedAt: 'desc' }, take: 3 },
        },
    });

    return {
        service: { id: service.id, name: service.name, slug: service.slug },
        competitors: others.map((item) => ({
            name: item.name,
            slug: item.slug,
            domain: item.domain,
            latestPrices: item.priceSnapshots.map((snap) => ({
                plan: snap.plan,
                price: snap.price,
                currency: snap.currency,
                interval: snap.interval,
            })),
        })),
    };
}

export async function getTrialTerms(slug: string) {
    const service = await prisma.service.findUnique({ where: { slug } });
    if (!service) throw new NotFoundError('Service not found');

    const [trialCount, activeCount] = await Promise.all([
        prisma.subscription.count({ where: { serviceId: service.id, trialStatus: true } }),
        prisma.subscription.count({ where: { serviceId: service.id } }),
    ]);

    return {
        service: { id: service.id, name: service.name, slug: service.slug },
        hasTrialUsers: trialCount > 0,
        trialShare: activeCount ? trialCount / activeCount : 0,
        autoRenew: true,
    };
}

