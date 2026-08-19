import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as me from "../controllers/me.controller";

const router = Router();

router.get("/", requireAuth, me.getMe);
router.patch("/fcm-token", requireAuth, me.updateFcmToken);
router.delete("/", requireAuth, me.deleteAccount);

export default router;
