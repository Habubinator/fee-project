import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as sub from "../controllers/subscription.controller";

const router = Router();

router.get("/", requireAuth, sub.list);
router.get("/:id", requireAuth, sub.getOne);
router.patch("/:id", requireAuth, sub.update);
router.delete("/:id", requireAuth, sub.remove);

export default router;
