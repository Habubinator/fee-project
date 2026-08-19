import { Router } from "express";
import * as webhook from "../controllers/webhook.controller";

const router = Router();

router.post("/gmail", webhook.gmailPush);
router.post("/monobank", webhook.monobankWebhook);

export default router;
