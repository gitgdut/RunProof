import { ok, queryObject, respond } from "@/lib/api";
import { getLeaderboard } from "@/lib/services";
import { leaderboardSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => {
    const query = leaderboardSchema.parse(queryObject(request));
    const { pagination, ...data } = await getLeaderboard(query);
    return ok(data, { requestId, pagination });
  });
}
