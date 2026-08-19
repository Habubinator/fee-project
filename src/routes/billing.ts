import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as billing from "../controllers/billing.controller";

const router = Router();

router.post("/checkout", requireAuth, billing.checkout);

export default router;
