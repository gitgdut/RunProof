import { ok, queryObject, respond } from "@/lib/api";
import { getLeaderboard } from "@/lib/services";
import { leaderboardSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => ok(await getLeaderboard(leaderboardSchema.parse(queryObject(request))), { requestId }));
}
