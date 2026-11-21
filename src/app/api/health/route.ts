import { AppError, ok, respond } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  return respond(async (requestId) => {
    const dataMode = process.env.DATA_MODE === "mock" ? "mock" : "prisma";
    if (dataMode === "prisma") {
      try {
        await prisma.$queryRaw`SELECT 1 FROM "games" LIMIT 1`;
      } catch {
        throw new AppError(503, "DATABASE_UNAVAILABLE", "Database is unavailable or migrations have not been applied");
      }
    }
    return ok({ service: "runproof-api", status: "ok", dataMode, database: dataMode === "mock" ? "not-used" : "connected" }, { requestId });
  });
}
