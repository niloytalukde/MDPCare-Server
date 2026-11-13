// =====================================================================
// Prisma settings for this project.
//
// .env is loaded from THIS folder (not from the folder a command is run
// in), so Prisma - and the VS Code Prisma extension - always find it.
// =====================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

const projectFolder = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(projectFolder, ".env"), quiet: true });

export default defineConfig({
    schema: path.join(projectFolder, "src/prisma"),
    migrations: {
        path: path.join(projectFolder, "src/prisma/migrations"),
    },
    datasource: {
        // Only "migrate" commands need the database. "validate" and
        // "generate" (and the editor) work even without DATABASE_URL.
        url: process.env.DATABASE_URL,
    },
});
