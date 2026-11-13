import type { UserRoleType } from "../generated/prisma/enums.js";

export interface AuthUser {
    id: number;
    phone?: string;
    email?: string | null;
    name?: string | null;
    roles: UserRoleType[];
    tokenVersion: number;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}
