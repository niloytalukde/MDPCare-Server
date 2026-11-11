import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../../errors/AppError.js";

export interface CreateCategoryInput {
    name: string;
    description?: string | null | undefined;
    imageUrl?: string | null | undefined;
}

export interface UpdateCategoryInput {
    name?: string | undefined;
    description?: string | null | undefined;
    imageUrl?: string | null | undefined;
}

export interface CategoryFilters {
    search?: string | undefined;
    includeServices?: boolean | undefined;
}

// ---------------------------------------------
// 1. Create Category
// ---------------------------------------------
const createCategory = async (payload: CreateCategoryInput) => {
    const name = payload.name?.trim();

    if (!name) {
        throw new AppError(400, "Category name is required");
    }

    const existingCategory = await prisma.category.findUnique({
        where: { name },
    });

    if (existingCategory) {
        throw new AppError(409, "A category with this name already exists");
    }

    const category = await prisma.category.create({
        data: {
            name,
            description: payload.description?.trim() || null,
            imageUrl: payload.imageUrl?.trim() || null,
        },
    });

    return category;
};

// ---------------------------------------------
// 2. Get All Categories
// ---------------------------------------------
const getAllCategories = async (filters: CategoryFilters = {}) => {
    const { search, includeServices } = filters;

    const where: Record<string, unknown> = {};

    if (search?.trim()) {
        where.name = {
            contains: search.trim(),
            mode: "insensitive",
        };
    }

    const categories = await prisma.category.findMany({
        where,
        include: {
            services: includeServices ? true : false,
            _count: {
                select: { services: true },
            },
        },
        orderBy: { name: "asc" },
    });

    return categories;
};

// ---------------------------------------------
// 3. Get Single Category by ID
// ---------------------------------------------
const getSingleCategory = async (
    categoryId: number,
    includeServices = false
) => {
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
        throw new AppError(400, "Invalid category ID");
    }

    const category = await prisma.category.findUnique({
        where: { id: categoryId },
        include: {
            services: includeServices ? true : false,
            _count: {
                select: { services: true },
            },
        },
    });

    if (!category) {
        throw new AppError(404, "Category not found");
    }

    return category;
};

// ---------------------------------------------
// 4. Update Category
// ---------------------------------------------
const updateCategory = async (
    categoryId: number,
    payload: UpdateCategoryInput
) => {
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
        throw new AppError(400, "Invalid category ID");
    }

    const existingCategory = await prisma.category.findUnique({
        where: { id: categoryId },
    });

    if (!existingCategory) {
        throw new AppError(404, "Category not found");
    }

    // If updating name, check for uniqueness conflicts
    if (payload.name !== undefined) {
        const name = payload.name.trim();

        if (!name) {
            throw new AppError(400, "Category name cannot be empty");
        }

        const conflict = await prisma.category.findUnique({
            where: { name },
        });

        if (conflict && conflict.id !== categoryId) {
            throw new AppError(409, "A category with this name already exists");
        }

        payload.name = name;
    }

    const updated = await prisma.category.update({
        where: { id: categoryId },
        data: {
            ...(payload.name !== undefined && { name: payload.name }),
            ...(payload.description !== undefined && {
                description: payload.description?.trim() || null,
            }),
            ...(payload.imageUrl !== undefined && {
                imageUrl: payload.imageUrl?.trim() || null,
            }),
        },
        include: {
            _count: {
                select: { services: true },
            },
        },
    });

    return updated;
};

// ---------------------------------------------
// 5. Delete Category
// ---------------------------------------------
const deleteCategory = async (categoryId: number, cascade = false) => {
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
        throw new AppError(400, "Invalid category ID");
    }

    const existingCategory = await prisma.category.findUnique({
        where: { id: categoryId },
        include: {
            _count: {
                select: { services: true },
            },
        },
    });

    if (!existingCategory) {
        throw new AppError(404, "Category not found");
    }

    const servicesCount = existingCategory._count.services;

    if (servicesCount > 0 && !cascade) {
        throw new AppError(
            400,
            `Cannot delete category. It currently has ${servicesCount} associated service(s). Delete or reassign the services first.`
        );
    }

    // If cascade is requested, delete linked services first
    if (servicesCount > 0 && cascade) {
        await prisma.service.deleteMany({
            where: { categoryId },
        });
    }

    await prisma.category.delete({
        where: { id: categoryId },
    });

    return { id: categoryId };
};

export const CategoryService = {
    createCategory,
    getAllCategories,
    getSingleCategory,
    updateCategory,
    deleteCategory,
};
