export interface AuthUser {
    id: number;
    phone?: string;
    email?: string | null;
    name?: string | null;
    [key: string]: unknown;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}
