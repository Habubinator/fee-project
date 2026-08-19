import { prisma } from "../lib/prisma";
import { notificationQueue } from "../lib/queues";
import { PriceTier } from "../lib/priceParser";

export async function queuePriceHikeAlerts(
    serviceId: string,
    oldTiers: PriceTier[],
    newTiers: PriceTier[],
): Promise<void> {
    const changedTiers = newTiers.filter((newTier) => {
        const old = oldTiers.find(
            (t) => t.plan === newTier.plan && t.interval === newTier.interval,
        );
        if (!old) return true;
        return Math.abs(newTier.price - old.price) / old.price > 0.01;
    });

    if (changedTiers.length === 0) return;

    const subscriptions = await prisma.subscription.findMany({
        where: { serviceId, status: "ACTIVE" },
        select: { id: true, userId: true },
    });

    if (subscriptions.length === 0) return;

    await prisma.subscription.updateMany({
        where: { serviceId, status: "ACTIVE" },
        data: { status: "PRICE_HIKED" },
    });

    const userIds = [...new Set(subscriptions.map((s) => s.userId))];
    for (const userId of userIds) {
        await notificationQueue.add("price-hike", {
            userId,
            serviceId,
            oldTiers,
            newTiers: changedTiers,
        });
    }
}

export async function scheduleUpcomingAlerts(): Promise<void> {
    const now = new Date();

    // Renewal alerts: renewalDate within the next 5 days
    const renewalWindow = new Date(now.getTime() + 5 * 86_400_000);
    const renewalSubs = await prisma.subscription.findMany({
        where: {
            status: "ACTIVE",
            renewalDate: { gte: now, lte: renewalWindow },
        },
        select: {
            id: true,
            userId: true,
            serviceName: true,
            renewalDate: true,
            price: true,
            currency: true,
        },
    });

    for (const sub of renewalSubs) {
        await notificationQueue.add("renewal-alert", {
            userId: sub.userId,
            subscriptionId: sub.id,
            serviceName: sub.serviceName,
            renewalDate: sub.renewalDate?.toISOString(),
            price: sub.price,
            currency: sub.currency,
        });
    }

    // Trial-ending alerts: trialEndsAt within 7 days, also catch 3-day window
    const trialWindow = new Date(now.getTime() + 7 * 86_400_000);
    const trialSubs = await prisma.subscription.findMany({
        where: {
            status: "ACTIVE",
            trialStatus: true,
            trialEndsAt: { gte: now, lte: trialWindow },
        },
        select: {
            id: true,
            userId: true,
            serviceName: true,
            trialEndsAt: true,
        },
    });

    for (const sub of trialSubs) {
        if (!sub.trialEndsAt) continue;
        const msLeft = sub.trialEndsAt.getTime() - now.getTime();
        const daysLeft = Math.ceil(msLeft / 86_400_000);
        await notificationQueue.add("trial-ending", {
            userId: sub.userId,
            subscriptionId: sub.id,
            serviceName: sub.serviceName,
            trialEndsAt: sub.trialEndsAt.toISOString(),
            daysLeft,
        });
    }
}
