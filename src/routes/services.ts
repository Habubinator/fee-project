import { Router } from "express";
import * as service from "../controllers/service.controller";
import * as guide from "../controllers/cancelGuide.controller";
import { requireAuth } from "../middleware/auth";
import { requirePlan } from "../middleware/requirePlan";

const router = Router();

router.get("/", service.list);
router.get("/:slug/pricing", service.getPricing);
router.get("/:slug/cancel-score", service.getCancelScore);
router.get("/:slug/competitors", service.getCompetitors);
router.get("/:slug/trials", service.getTrials);
router.get("/:slug/cancel-guide", requireAuth, requirePlan, guide.getGuide);

export default router;
