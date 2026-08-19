import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as auth from "../controllers/auth.controller";

const router = Router();

router.post("/register", auth.register);
router.post("/login", auth.login);
router.post("/refresh", auth.refresh);
router.post("/logout", requireAuth, auth.logout);
router.get("/gmail", requireAuth, auth.getGmailUrl);
router.get("/gmail/callback", auth.gmailCallback);

export default router;
