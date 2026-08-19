import { PlanStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../lib/errors';

export async function getStats() {
    const [total, active, trial, free, expired, cancelled, subscriptions] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { planStatus: 'ACTIVE' } }),
        prisma.user.count({ where: { planStatus: 'TRIAL' } }),
        prisma.user.count({ where: { planStatus: 'FREE' } }),
        prisma.user.count({ where: { planStatus: 'EXPIRED' } }),
        prisma.user.count({ where: { planStatus: 'CANCELLED' } }),
        prisma.subscription.count(),
    ]);
    return { users: { total, active, trial, free, expired, cancelled }, subscriptions };
}

export async function listUsers(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
        ? { email: { contains: search, mode: 'insensitive' as const } }
        : {};

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            skip,
            take:    limit,
            orderBy: { createdAt: 'desc' },
            select: {
                id:            true,
                email:         true,
                planStatus:    true,
                trialEndsAt:   true,
                planExpiresAt: true,
                isAdmin:       true,
                createdAt:     true,
                _count:        { select: { subscriptions: true } },
            },
        }),
        prisma.user.count({ where }),
    ]);

    return { users, total, page, pages: Math.ceil(total / limit) };
}

export async function getUserById(id: string) {
    const user = await prisma.user.findUnique({
        where:  { id },
        select: {
            id:             true,
            email:          true,
            planStatus:     true,
            trialEndsAt:    true,
            planExpiresAt:  true,
            isAdmin:        true,
            gmailHistoryId: true,
            fcmToken:       true,
            createdAt:      true,
            updatedAt:      true,
            subscriptions: {
                orderBy: { renewalDate: 'asc' },
                select: {
                    id:          true,
                    serviceName: true,
                    price:       true,
                    currency:    true,
                    renewalDate: true,
                    status:      true,
                },
            },
        },
    });
    if (!user) throw new NotFoundError('User not found');
    return user;
}

export async function updateUser(
    id: string,
    data: { planStatus?: PlanStatus; planExpiresAt?: Date; isAdmin?: boolean },
) {
    try {
        return await prisma.user.update({
            where:  { id },
            data,
            select: { id: true, email: true, planStatus: true, planExpiresAt: true, isAdmin: true },
        });
    } catch {
        throw new NotFoundError('User not found');
    }
}

export async function removeUser(id: string): Promise<void> {
    try {
        await prisma.user.delete({ where: { id } });
    } catch {
        throw new NotFoundError('User not found');
    }
}

export async function listSubscriptions(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [subscriptions, total] = await Promise.all([
        prisma.subscription.findMany({
            skip,
            take:    limit,
            orderBy: { createdAt: 'desc' },
            select: {
                id:          true,
                serviceName: true,
                price:       true,
                currency:    true,
                renewalDate: true,
                status:      true,
                createdAt:   true,
                user:        { select: { email: true } },
            },
        }),
        prisma.subscription.count(),
    ]);
    return { subscriptions, total, page, pages: Math.ceil(total / limit) };
}

export async function listEmailEvents(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
        prisma.emailEvent.findMany({
            skip,
            take:    limit,
            orderBy: { processedAt: 'desc' },
            select: {
                id:             true,
                gmailMessageId: true,
                subject:        true,
                senderDomain:   true,
                processedAt:    true,
                user:           { select: { email: true } },
            },
        }),
        prisma.emailEvent.count(),
    ]);
    return { events, total, page, pages: Math.ceil(total / limit) };
}
