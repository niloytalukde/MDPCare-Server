import type { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { ProviderService } from "./provider.service.js";

const uid = (req: Request) => Number(req.user?.id);

const upsertService = catchAsync(async (req: Request, res: Response) => {
    const data = await ProviderService.upsertService(uid(req), req.body);
    sendResponse(res, { success: true, statusCode: 200, message: "Service saved", data });
});

const listServices = catchAsync(async (req: Request, res: Response) => {
    const data = await ProviderService.listServices(uid(req));
    sendResponse(res, { success: true, statusCode: 200, message: "Services retrieved", data });
});

export const ProviderController = { upsertService, listServices };
