import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import router from "../routes/index.js";
import globalErrorHandler from "../middleware/globalErrorHandler.js";

const app: Application = express();

// Security Middleware
app.use(helmet());

// CORS Middleware
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || "*",
        credentials: true,
    })
);

// Body Parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Compression
app.use(compression());

// Health Check
app.get("/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "MDPCare API is running",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
    });
});

// API Welcome Route
app.get("/api/v1", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Welcome to MDPCare API",
        version: "1.0.0",
        endpoints: {
            auth: "/api/v1/auth",
            users: "/api/v1/users",
            addresses: "/api/v1/addresses",
            familyMembers: "/api/v1/family-members",
            categories: "/api/v1/categories",
            services: "/api/v1/services",
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
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

// Global Error Handler (must be last)
app.use(globalErrorHandler);

export default app;
