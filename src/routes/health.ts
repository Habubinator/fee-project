import { Router } from "express";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

const router = Router();

router.get("/", async (_req, res) => {
    const checks: Record<string, string> = { api: "ok" };

    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.db = "ok";
    } catch {
        checks.db = "error";
    }

    try {
        await redis.ping();
        checks.redis = "ok";
    } catch {
        checks.redis = "error";
    }

    const healthy = Object.values(checks).every((v) => v === "ok");
    res.status(healthy ? 200 : 503).json({
        status: healthy ? "ok" : "degraded",
        checks,
    });
});

export default router;
