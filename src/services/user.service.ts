import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError } from '../lib/errors';

export async function getMe(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id:               true,
            email:            true,
            planStatus:       true,
            trialEndsAt:      true,
            planExpiresAt:    true,
            isAdmin:          true,
            createdAt:        true,
            gmailAccessToken: true,
        },
    });
    if (!user) throw new NotFoundError('User not found');

    const { gmailAccessToken, ...rest } = user;
    return { ...rest, gmailConnected: gmailAccessToken !== null };
}

export async function getIsAdmin(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { isAdmin: true },
    });
    return user?.isAdmin ?? false;
}

export async function updateFcmToken(userId: string, fcmToken: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { fcmToken } });
}

export async function deleteAccount(userId: string, password: string): Promise<void> {
    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { passwordHash: true },
    });
    if (!user) throw new NotFoundError('User not found');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new ForbiddenError('Incorrect password');

    await prisma.user.delete({ where: { id: userId } });
}
