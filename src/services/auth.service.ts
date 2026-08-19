import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { prisma } from '../lib/prisma';
import { generateAccessToken, createRefreshToken, rotateRefreshToken, revokeRefreshToken } from '../lib/tokens';
import { emailSyncQueue } from '../jobs';
import { config } from '../config';
import { BadRequestError, ConflictError, ServiceUnavailableError, UnauthorizedError } from '../lib/errors';

function makeOAuth2Client() {
    return new google.auth.OAuth2(
        config.GOOGLE_CLIENT_ID,
        config.GOOGLE_CLIENT_SECRET,
        config.GOOGLE_REDIRECT_URI,
    );
}

export async function register(email: string, password: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictError('Email already registered');

    const passwordHash = await bcrypt.hash(password, 12);
    const trialEndsAt  = new Date(Date.now() + 14 * 86_400_000);

    const user = await prisma.user.create({
        data: { email, passwordHash, trialEndsAt },
        select: { id: true, email: true, planStatus: true, trialEndsAt: true, createdAt: true },
    });

    return {
        accessToken:  generateAccessToken(user.id),
        refreshToken: await createRefreshToken(user.id),
        user,
    };
}

export async function login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new UnauthorizedError('Invalid credentials');
    }

    return {
        accessToken:  generateAccessToken(user.id),
        refreshToken: await createRefreshToken(user.id),
        user: { id: user.id, email: user.email, planStatus: user.planStatus, trialEndsAt: user.trialEndsAt },
    };
}

export async function refresh(token: string) {
    const { userId, newRefreshToken } = await rotateRefreshToken(token);
    return { accessToken: generateAccessToken(userId), refreshToken: newRefreshToken };
}

export async function logout(_userId: string, refreshToken?: string) {
    if (refreshToken) await revokeRefreshToken(refreshToken);
}

export async function getGmailOAuthUrl(userId: string): Promise<string> {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI) {
        throw new ServiceUnavailableError('Gmail OAuth not configured');
    }

    const state = jwt.sign(
        { userId, type: 'gmail-oauth-state' },
        config.JWT_SECRET,
        { expiresIn: '10m' },
    );

    return makeOAuth2Client().generateAuthUrl({
        access_type: 'offline',
        scope:  ['https://www.googleapis.com/auth/gmail.readonly'],
        prompt: 'consent',
        state,
    });
}

export async function handleGmailCallback(code: string, state: string) {
    let payload: { userId: string; type: string };
    try {
        payload = jwt.verify(state, config.JWT_SECRET) as { userId: string; type: string };
        if (payload.type !== 'gmail-oauth-state') throw new Error();
    } catch {
        throw new BadRequestError('Invalid or expired state parameter');
    }

    const oauth2Client = makeOAuth2Client();
    let tokens: { access_token?: string | null; refresh_token?: string | null };
    try {
        const { tokens: t } = await oauth2Client.getToken(code);
        tokens = t;
    } catch {
        throw new BadRequestError('Failed to exchange authorization code');
    }

    oauth2Client.setCredentials(tokens);
    let historyId: string | undefined;
    try {
        const profile = await google.gmail({ version: 'v1', auth: oauth2Client })
            .users.getProfile({ userId: 'me' });
        historyId = profile.data.historyId ?? undefined;
    } catch { /* non-fatal */ }

    await prisma.user.update({
        where: { id: payload.userId },
        data: {
            gmailAccessToken:  tokens.access_token  ?? undefined,
            gmailRefreshToken: tokens.refresh_token ?? undefined,
            gmailHistoryId:    historyId,
        },
    });

    await emailSyncQueue.add('historical-sync', { userId: payload.userId });
    return { success: true, message: 'Gmail connected. Historical sync queued.' };
}
