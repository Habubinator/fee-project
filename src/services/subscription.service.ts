import { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isFullAccess } from '../lib/plan';
import { ForbiddenError, NotFoundError } from '../lib/errors';

const FREE_TIER_LIMIT = 10;

const SELECT = {
    id:          true,
    serviceName: true,
    serviceId:   true,
    price:       true,
    currency:    true,
    renewalDate: true,
    trialStatus: true,
    trialEndsAt: true,
    cancelUrl:   true,
    status:      true,
    createdAt:   true,
    updatedAt:   true,
} as const;

async function enrichWithServiceSlugs<T extends { serviceId: string | null }>(
    rows: T[],
): Promise<(T & { serviceSlug: string | null })[]> {
    const ids = [...new Set(rows.map(r => r.serviceId).filter((id): id is string => !!id))];
    if (ids.length === 0) return rows.map(r => ({ ...r, serviceSlug: null }));

    const services = await prisma.service.findMany({
        where:  { id: { in: ids } },
        select: { id: true, slug: true },
    });
    const slugMap = Object.fromEntries(services.map(s => [s.id, s.slug]));

    return rows.map(r => ({
        ...r,
        serviceSlug: r.serviceId ? (slugMap[r.serviceId] ?? null) : null,
    }));
}

export async function listSubscriptions(userId: string) {
    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { planStatus: true, trialEndsAt: true, planExpiresAt: true },
    });

    const fullAccess = user
        ? isFullAccess(user.planStatus, user.trialEndsAt, user.planExpiresAt)
        : false;

    const subscriptions = await prisma.subscription.findMany({
        where:   { userId },
        orderBy: [{ renewalDate: 'asc' }, { createdAt: 'desc' }],
        take:    fullAccess ? undefined : FREE_TIER_LIMIT,
        select:  SELECT,
    });

    return {
        subscriptions: await enrichWithServiceSlugs(subscriptions),
        ...(fullAccess ? {} : { limited: true, upgradeUrl: '/v1/billing/checkout' }),
    };
}

export async function getSubscription(userId: string, id: string) {
    const sub = await prisma.subscription.findUnique({
        where:  { id },
        select: { ...SELECT, userId: true },
    });
    if (!sub) throw new NotFoundError('Subscription not found');
    if (sub.userId !== userId) throw new ForbiddenError();

    const { userId: _uid, ...rest } = sub;
    return rest;
}

export async function updateSubscription(userId: string, id: string, status: SubscriptionStatus) {
    const existing = await prisma.subscription.findUnique({
        where:  { id },
        select: { userId: true },
    });
    if (!existing) throw new NotFoundError('Subscription not found');
    if (existing.userId !== userId) throw new ForbiddenError();

    return prisma.subscription.update({ where: { id }, data: { status }, select: SELECT });
}

export async function removeSubscription(userId: string, id: string): Promise<void> {
    const existing = await prisma.subscription.findUnique({
        where:  { id },
        select: { userId: true },
    });
    if (!existing) throw new NotFoundError('Subscription not found');
    if (existing.userId !== userId) throw new ForbiddenError();

    await prisma.subscription.delete({ where: { id } });
}
