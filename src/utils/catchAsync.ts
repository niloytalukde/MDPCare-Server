import type {
    Request,
    Response,
    NextFunction,
    RequestHandler,
} from "express";

type AsyncController = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<unknown>;

const catchAsync = (fn: AsyncController): RequestHandler => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

export default catchAsync;