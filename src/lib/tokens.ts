import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { prisma } from './prisma';

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 30;

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = jwt.sign({ userId }, config.JWT_REFRESH_SECRET, {
    expiresIn: `${REFRESH_TTL_DAYS}d`,
  });
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  return token;
}

export async function rotateRefreshToken(
  oldToken: string
): Promise<{ userId: string; newRefreshToken: string }> {
  let payload: { userId: string };
  try {
    payload = jwt.verify(oldToken, config.JWT_REFRESH_SECRET) as { userId: string };
  } catch {
    throw new Error('Invalid refresh token');
  }

  const oldHash = hashToken(oldToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: oldHash } });

  if (!stored || stored.expiresAt < new Date()) {
    if (stored) await prisma.refreshToken.delete({ where: { tokenHash: oldHash } });
    throw new Error('Refresh token expired or not found');
  }

  await prisma.refreshToken.delete({ where: { tokenHash: oldHash } });
  const newRefreshToken = await createRefreshToken(payload.userId);

  return { userId: payload.userId, newRefreshToken };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(raw) } });
}
