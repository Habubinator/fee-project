import path from 'path';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';

import healthRouter from './routes/health';
import authRouter from './routes/auth';
import meRouter from './routes/me';
import subscriptionsRouter from './routes/subscriptions';
import billingRouter from './routes/billing';
import adminRouter from './routes/admin';
import webhooksRouter from './routes/webhooks';
import servicesRouter from './routes/services';
import signalsRouter from './routes/signals';
import { errorHandler, notFound } from './middleware/errorHandler';

const app = express();
const staticDir = path.join(process.cwd(), 'static');

app.use(cors());

app.use('/v1/webhooks/monobank', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/health', healthRouter);

const api = express.Router();
api.use(helmet());
api.use('/auth', authRouter);
api.use('/me', meRouter);
api.use('/subscriptions', subscriptionsRouter);
api.use('/billing', billingRouter);
api.use('/admin', adminRouter);
api.use('/webhooks', webhooksRouter);
api.use('/services', servicesRouter);
api.use('/signals', signalsRouter);
api.use(notFound);
app.use('/v1', api);

app.use(express.static(staticDir, { extensions: ['html'] }));
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(staticDir, 'landing-b2c.html'));
});

app.use(errorHandler);

export default app;
