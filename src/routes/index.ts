import { Router } from "express";
import { AuthRoutes } from "../module/Auth/auth.routes.js";
import { UserRoutes } from "../module/users/user.routes.js";
import { AddressRoutes } from "../module/Address/address.routes.js";
import { FamilyMemberRoutes } from "../module/FamilyMember/familyMember.routes.js";
import { CategoryRoutes } from "../module/catalog/category/category.routes.js";
import { ServiceRoutes } from "../module/catalog/service/service.routes.js";

const router = Router();

const moduleRoutes = [
    {
        path: "/auth",
        route: AuthRoutes,
    },
    {
        path: "/users",
        route: UserRoutes,
    },
    {
        path: "/addresses",
        route: AddressRoutes,
    },
    {
        path: "/family-members",
        route: FamilyMemberRoutes,
    },
    {
        path: "/categories",
        route: CategoryRoutes,
    },
    {
        path: "/services",
        route: ServiceRoutes,
    },
    // Catalog nested path aliases
    {
        path: "/catalog/categories",
        route: CategoryRoutes,
    },
    {
        path: "/catalog/services",
        route: ServiceRoutes,
    },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
