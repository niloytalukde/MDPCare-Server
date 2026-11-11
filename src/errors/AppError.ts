
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly status: "fail" | "error";
    public readonly isOperational: boolean;

    constructor(statusCode: number, message: string) {
        super(message);

        this.name = "AppError";
        this.statusCode = statusCode;
        this.status = statusCode >= 500 ? "error" : "fail";
        this.isOperational = true;

        Object.setPrototypeOf(this, new.target.prototype);

        Error.captureStackTrace?.(this, this.constructor);
    }
}

export default AppError;
