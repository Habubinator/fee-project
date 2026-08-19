import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";
import * as admin from "../controllers/admin.controller";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/stats", admin.stats);
router.get("/users", admin.listUsers);
router.get("/users/:id", admin.getUser);
router.patch("/users/:id", admin.updateUser);
router.delete("/users/:id", admin.removeUser);
router.get("/subscriptions", admin.listSubscriptions);
router.get("/email-events", admin.listEmailEvents);

export default router;
