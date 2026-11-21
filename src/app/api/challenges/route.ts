import { ok, queryObject, respond } from "@/lib/api";
import { listChallenges } from "@/lib/services";
import { listChallengesSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => {
    const query = listChallengesSchema.parse(queryObject(request));
    const { items, pagination } = await listChallenges(query);
    return ok({ items }, { requestId, pagination });
  });
}
