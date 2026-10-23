import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "./config.js";

/**
 * The single Prisma client for this process. Each client owns a connection
 * pool, so creating more than one would multiply database connections.
 * Prisma 7 talks to Postgres through a driver adapter (node-postgres here).
 */
const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
