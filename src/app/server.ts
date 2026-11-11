import "dotenv/config";
import app from "./app.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

const startServer = async () => {
    try {
        // Attempt Database Connection
        try {
            await prisma.$connect();
            console.log("Database connected successfully!");
        } catch (dbError) {
            console.warn(
                "Warning: Database connection could not be established on startup.\n" +
                "The server will still run, but database operations will fail until PostgreSQL is running.\n" +
                "Error:",
                (dbError as Error).message
            );
        }

        // Start HTTP Server
        const server = app.listen(env.PORT, () => {
            console.log(`
========================================
       MDPCare Backend Server
========================================
  Environment : ${env.NODE_ENV}
  Port        : ${env.PORT}
  Server      : http://localhost:${env.PORT}
========================================
      `);
        });

        // Server Error Handling (e.g., EADDRINUSE)
        server.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                console.error(
                    `Port ${env.PORT} is already in use. Either terminate the process using this port or specify another PORT in .env.`
                );
            } else {
                console.error("Server error:", err);
            }
            process.exit(1);
        });

        // Graceful Shutdown
        const shutdown = async (signal: string) => {
            console.log(`\n${signal} received. Shutting down...`);

            server.close(async () => {
                try {
                    await prisma.$disconnect();
                } catch {
                    // Ignore disconnect error during shutdown
                }

                console.log("Database disconnected.");
                console.log("Server closed successfully.");

                process.exit(0);
            });
        };

        process.on("SIGINT", () => void shutdown("SIGINT"));
        process.on("SIGTERM", () => void shutdown("SIGTERM"));

    } catch (error) {
        console.error("Server startup failed:", error);

        try {
            await prisma.$disconnect();
        } catch {
            // Ignore
        }

        process.exit(1);
    }
};

startServer();
