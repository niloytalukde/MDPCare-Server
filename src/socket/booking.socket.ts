import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { authenticateAccessToken } from "../middleware/auth.js";
import { env } from "../config/env.js";
import type { AuthUser } from "../types/index.js";

/**
 * Real-time booking notifications.
 *
 * Security model (SEC-15):
 *  - Handshake must carry a valid access token (`auth.token` or `Authorization: Bearer`).
 *  - Each socket joins ONLY its own room `user:{id}`. Clients cannot join arbitrary rooms;
 *    the server decides who receives which event, after its own authorization checks.
 *  - Sockets carry no write operations; all state changes go through the REST API.
 */

let io: Server | null = null;

const userRoom = (userId: number) => `user:${userId}`;

export const initSocket = (httpServer: HttpServer): Server => {
    io = new Server(httpServer, {
        cors: { origin: env.CORS_ORIGINS.includes("*") ? true : env.CORS_ORIGINS, credentials: true },
        maxHttpBufferSize: 16 * 1024,
    });

    io.use(async (socket, next) => {
        try {
            const header = socket.handshake.headers.authorization;
            const token =
                (typeof socket.handshake.auth?.token === "string" && socket.handshake.auth.token) ||
                (header?.startsWith("Bearer ") ? header.slice(7) : undefined);

            if (!token) return next(new Error("Unauthorized"));

            (socket.data as { user: AuthUser }).user = await authenticateAccessToken(token);
            next();
        } catch {
            next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket: Socket) => {
        const user = (socket.data as { user: AuthUser }).user;
        void socket.join(userRoom(user.id));
        socket.emit("connected", { userId: user.id });
    });

    return io;
};

/** Fire-and-forget notification. Never throws; missing socket server is a no-op. */
export const emitToUsers = (userIds: number[], event: string, payload: unknown) => {
    if (!io || userIds.length === 0) return;
    const rooms = [...new Set(userIds)].map(userRoom);
    io.to(rooms).emit(event, payload);
};

export const closeSocket = async () => {
    if (io) {
        await io.close();
        io = null;
    }
};
