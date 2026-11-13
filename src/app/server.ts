import "dotenv/config";
import { createServer } from "node:http";
import app from "./app.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { closeRedisConnections } from "../lib/redis.js";
import { initSocket, closeSocket } from "../socket/booking.socket.js";
import { startBookingWorkers, stopBookingWorkers } from "../module/booking/booking-expiry.worker.js";
import { seedAdmin } from "../seed/seed-admin.js";

const SHUTDOWN_TIMEOUT_MS = 15_000;

const startServer = async () => {
    try {
        try {
            await prisma.$connect();
            console.log("Database connected successfully!");

            // Make sure the admin from .env (ADMIN_PHONE) exists.
            // If it fails, the server still starts - only the seed is skipped.
            await seedAdmin().catch((seedError) => {
                console.error("Admin seed failed:", (seedError as Error).message || seedError);
            });
        } catch (dbError) {
            console.warn(
                "Warning: Database connection could not be established on startup.\n" +
                    "The server will still run, but database operations will fail until PostgreSQL is running.\n" +
                    "Error:",
                (dbError as Error).message
            );
        }

        const server = createServer(app);
        initSocket(server);

        server.listen(env.PORT, () => {
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

        server.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                console.error(`Port ${env.PORT} is already in use. Terminate the other process or set another PORT in .env.`);
            } else {
                console.error("Server error:", err);
            }
            process.exit(1);
        });

        try {
            await startBookingWorkers();
        } catch (err) {
            console.error("Booking workers failed to start (bookings will not expire automatically):", (err as Error).message);
        }

        let shuttingDown = false;
        const shutdown = async (signal: string, code = 0) => {
            if (shuttingDown) return;
            shuttingDown = true;
            console.log(`\n${signal} received. Shutting down...`);

            const force = setTimeout(() => {
                console.error("Graceful shutdown timed out; forcing exit.");
                process.exit(1);
            }, SHUTDOWN_TIMEOUT_MS);
            force.unref();

            server.close();
            await Promise.allSettled([closeSocket(), stopBookingWorkers()]);
            await closeRedisConnections();
            await prisma.$disconnect().catch(() => undefined);

            console.log("Server closed successfully.");
            process.exit(code);
        };

        process.on("SIGINT", () => void shutdown("SIGINT"));
        process.on("SIGTERM", () => void shutdown("SIGTERM"));

        // CODE-03: never run in an unknown state after a programming error
        process.on("unhandledRejection", (reason) => {
            console.error("Unhandled promise rejection:", reason);
        });
        process.on("uncaughtException", (err) => {
            console.error("Uncaught exception:", err);
            void shutdown("uncaughtException", 1);
        });
    } catch (error) {
        console.error("Server startup failed:", error);
        await prisma.$disconnect().catch(() => undefined);
        process.exit(1);
    }
};

void startServer();
