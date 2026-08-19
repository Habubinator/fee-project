import * as admin from 'firebase-admin';
import { config } from '../config';

function getApp(): admin.app.App {
    if (admin.apps.length > 0) return admin.apps[0]!;

    return admin.initializeApp({
        credential: admin.credential.cert({
            projectId:   config.FIREBASE_PROJECT_ID,
            clientEmail: config.FIREBASE_CLIENT_EMAIL,
            privateKey:  config.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

export async function sendPush(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
): Promise<void> {
    if (!config.FIREBASE_PROJECT_ID) {
        console.warn('[firebase] FIREBASE_PROJECT_ID not set — skipping push');
        return;
    }

    const app = getApp();

    try {
        await admin.messaging(app).send({
            token: fcmToken,
            notification: { title, body },
            data,
        });
    } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? '';
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token') {
            return;
        }
        throw err;
    }
}
