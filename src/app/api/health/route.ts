import { ok, respond } from "@/lib/api";

export async function GET() {
  return respond(async (requestId) => ok({ service: "runproof-api", status: "ok", dataMode: process.env.DATA_MODE === "mock" ? "mock" : "prisma" }, { requestId }));
}
