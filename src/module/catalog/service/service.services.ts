import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../errors/AppError.js";

export interface CreateServiceInput {
    name: string;
    description?: string | null | undefined;
    categoryId: number;
    price: number;
    discountPrice?: number | null | undefined;
    timeRequired?: number | null | undefined;
    imageUrl?: string | null | undefined;
    includes?: string[] | undefined;
    excludes?: string[] | undefined;
}

export interface UpdateServiceInput {
    name?: string | undefined;
    description?: string | null | undefined;
    categoryId?: number | undefined;
    price?: number | undefined;
    discountPrice?: number | null | undefined;
    timeRequired?: number | null | undefined;
    imageUrl?: string | null | undefined;
    includes?: string[] | undefined;
    excludes?: string[] | undefined;
}

export interface ServiceFilters {
    search?: string | undefined;
    categoryId?: number | undefined;
    minPrice?: number | undefined;
    maxPrice?: number | undefined;
}

// ---------------------------------------------
// 1. Create Service
// ---------------------------------------------
const createService = async (payload: CreateServiceInput) => {
    const name = payload.name?.trim();
    const categoryId = Number(payload.categoryId);
    const price = Number(payload.price);

    if (!name) {
        throw new AppError(400, "Service name is required");
    }

    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
        throw new AppError(400, "A valid categoryId is required");
    }

    if (isNaN(price) || price < 0) {
        throw new AppError(400, "A valid non-negative price is required");
    }

    // Verify Category exists
    const categoryExists = await prisma.category.findUnique({
        where: { id: categoryId },
    });

    if (!categoryExists) {
        throw new AppError(404, "Referenced category not found");
    }

    // Check service name uniqueness
    const existingService = await prisma.service.findUnique({
        where: { name },
    });

    if (existingService) {
        throw new AppError(409, "A service with this name already exists");
    }

    // Validate discountPrice if provided
    let discountPrice: number | null = null;
    if (payload.discountPrice !== undefined && payload.discountPrice !== null) {
        discountPrice = Number(payload.discountPrice);
        if (isNaN(discountPrice) || discountPrice < 0) {
            throw new AppError(400, "Discount price must be a non-negative number");
        }
        if (discountPrice > price) {
            throw new AppError(400, "Discount price cannot exceed regular price");
        }
    }

    const service = await prisma.service.create({
        data: {
            name,
            description: payload.description?.trim() || null,
            categoryId,
            price,
            discountPrice,
            timeRequired:
                payload.timeRequired !== undefined && payload.timeRequired !== null
                    ? Number(payload.timeRequired)
                    : null,
            imageUrl: payload.imageUrl?.trim() || null,
            includes: Array.isArray(payload.includes) ? payload.includes : [],
            excludes: Array.isArray(payload.excludes) ? payload.excludes : [],
        },
        include: {
            category: true,
        },
    });

    return service;
};

// ---------------------------------------------
// 2. Get All Services
// ---------------------------------------------
const getAllServices = async (filters: ServiceFilters = {}) => {
    const { search, categoryId, minPrice, maxPrice } = filters;

    const where: Record<string, unknown> = {};

    if (search?.trim()) {
        where.OR = [
            { name: { contains: search.trim(), mode: "insensitive" } },
            { description: { contains: search.trim(), mode: "insensitive" } },
        ];
    }

    if (categoryId && Number.isSafeInteger(Number(categoryId))) {
        where.categoryId = Number(categoryId);
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
        where.price = {
            ...(minPrice !== undefined && { gte: Number(minPrice) }),
            ...(maxPrice !== undefined && { lte: Number(maxPrice) }),
        };
    }

    const services = await prisma.service.findMany({
        where,
        include: {
            category: {
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                },
            },
        },
        orderBy: { name: "asc" },
    });

    return services;
};

// ---------------------------------------------
// 3. Get Single Service by ID
// ---------------------------------------------
const getSingleService = async (serviceId: number) => {
    if (!Number.isSafeInteger(serviceId) || serviceId <= 0) {
        throw new AppError(400, "Invalid service ID");
    }

    const service = await prisma.service.findUnique({
        where: { id: serviceId },
        include: {
            category: true,
        },
    });

    if (!service) {
        throw new AppError(404, "Service not found");
    }

    return service;
};

// ---------------------------------------------
// 4. Update Service
// ---------------------------------------------
const updateService = async (
    serviceId: number,
    payload: UpdateServiceInput
) => {
    if (!Number.isSafeInteger(serviceId) || serviceId <= 0) {
        throw new AppError(400, "Invalid service ID");
    }

    const existingService = await prisma.service.findUnique({
        where: { id: serviceId },
    });

    if (!existingService) {
        throw new AppError(404, "Service not found");
    }

    // Check name uniqueness if changed
    if (payload.name !== undefined) {
        const name = payload.name.trim();

        if (!name) {
            throw new AppError(400, "Service name cannot be empty");
        }

        const conflict = await prisma.service.findUnique({
            where: { name },
        });

        if (conflict && conflict.id !== serviceId) {
            throw new AppError(409, "A service with this name already exists");
        }

        payload.name = name;
    }

    // Check categoryId if changed
    if (payload.categoryId !== undefined) {
        const categoryId = Number(payload.categoryId);

        if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
            throw new AppError(400, "Invalid categoryId");
        }

        const categoryExists = await prisma.category.findUnique({
            where: { id: categoryId },
        });

        if (!categoryExists) {
            throw new AppError(404, "Referenced category not found");
        }

        payload.categoryId = categoryId;
    }

    // Validate price and discountPrice
    const price =
        payload.price !== undefined ? Number(payload.price) : existingService.price;

    if (isNaN(price) || price < 0) {
        throw new AppError(400, "Price must be a non-negative number");
    }

    if (payload.discountPrice !== undefined) {
        if (payload.discountPrice !== null) {
            const discountPrice = Number(payload.discountPrice);
            if (isNaN(discountPrice) || discountPrice < 0) {
                throw new AppError(400, "Discount price must be a non-negative number");
            }
            if (discountPrice > price) {
                throw new AppError(400, "Discount price cannot exceed regular price");
            }
        }
    }

    const updated = await prisma.service.update({
        where: { id: serviceId },
        data: {
            ...(payload.name !== undefined && { name: payload.name }),
            ...(payload.description !== undefined && {
                description: payload.description?.trim() || null,
            }),
            ...(payload.categoryId !== undefined && {
                categoryId: payload.categoryId,
            }),
            ...(payload.price !== undefined && { price: Number(payload.price) }),
            ...(payload.discountPrice !== undefined && {
                discountPrice:
                    payload.discountPrice !== null
                        ? Number(payload.discountPrice)
                        : null,
            }),
            ...(payload.timeRequired !== undefined && {
                timeRequired:
                    payload.timeRequired !== null
                        ? Number(payload.timeRequired)
                        : null,
            }),
            ...(payload.imageUrl !== undefined && {
                imageUrl: payload.imageUrl?.trim() || null,
            }),
            ...(payload.includes !== undefined && {
                includes: Array.isArray(payload.includes) ? payload.includes : [],
            }),
            ...(payload.excludes !== undefined && {
                excludes: Array.isArray(payload.excludes) ? payload.excludes : [],
            }),
        },
        include: {
            category: true,
        },
    });

    return updated;
};

// ---------------------------------------------
// 5. Delete Service
// ---------------------------------------------
const deleteService = async (serviceId: number) => {
    if (!Number.isSafeInteger(serviceId) || serviceId <= 0) {
        throw new AppError(400, "Invalid service ID");
    }

    const existingService = await prisma.service.findUnique({
        where: { id: serviceId },
    });

    if (!existingService) {
        throw new AppError(404, "Service not found");
    }

    await prisma.service.delete({
        where: { id: serviceId },
    });

    return { id: serviceId };
};

export const ServiceCatalogService = {
    createService,
    getAllServices,
    getSingleService,
    updateService,
    deleteService,
};
