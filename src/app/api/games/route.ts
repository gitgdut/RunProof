import { ok, respond } from "@/lib/api";
import { listGames } from "@/lib/services";

export async function GET() {
  return respond(async (requestId) => ok(await listGames(), { requestId }));
}
