import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import router from "../routes/index.js";
import globalErrorHandler from "../middleware/globalErrorHandler.js";
import { globalLimiter } from "../middleware/rateLimiter.js";
import { env } from "../config/env.js";

const app: Application = express();

// Correct client IPs behind a reverse proxy (needed for rate limiting)
app.set("trust proxy", env.TRUST_PROXY);
app.disable("x-powered-by");

// Security Middleware
app.use(helmet());

// CORS (SEC-10): explicit allow-list; "*" only allowed without credentials
const allowAll = env.CORS_ORIGINS.includes("*");
app.use(
    cors({
        origin: allowAll ? "*" : env.CORS_ORIGINS,
        credentials: !allowAll,
    })
);

// Body Parser (SEC-12: small limit; no file uploads go through JSON)
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// Compression
app.use(compression());

// Health Check (not rate limited)
app.get("/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "MDPCare API is running",
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
});

app.use("/api", globalLimiter);

// API Welcome Route
app.get("/api/v1", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Welcome to MDPCare API",
        version: "1.0.0",
        endpoints: {
            auth: "/api/v1/auth (customer app login)",
            customer: "/api/v1/customer/profile",
            users: "/api/v1/users (admin)",
            addresses: "/api/v1/addresses",
            familyMembers: "/api/v1/family-members",
            categories: "/api/v1/categories",
            services: "/api/v1/services",
            provider: "/api/v1/provider (provider app login: /provider/auth)",
            bookings: "/api/v1/bookings",
            agencies: "/api/v1/agencies",
            admin: "/api/v1/admin",
            health: "/health",
        },
    });
});

// Application API Routes
app.use("/api/v1", router);

// 404 Handler (unmatched routes)
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.path}`,
    });
});

// Global Error Handler (must be last)
app.use(globalErrorHandler);

export default app;
