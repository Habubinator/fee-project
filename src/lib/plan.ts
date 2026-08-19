import { PlanStatus } from '@prisma/client';

export function isFullAccess(
    planStatus: PlanStatus,
    trialEndsAt: Date,
    planExpiresAt: Date | null,
): boolean {
    const now = new Date();
    return (
        (planStatus === 'ACTIVE' && (!planExpiresAt || planExpiresAt > now)) ||
        (planStatus === 'TRIAL'  && trialEndsAt > now) ||
        (planStatus === 'FREE'   && (!planExpiresAt || planExpiresAt > now))
    );
}
