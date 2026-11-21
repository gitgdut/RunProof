import { ok, queryObject, respond } from "@/lib/api";
import { listVoting } from "@/lib/services";
import { listVotingSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => {
    const query = listVotingSchema.parse(queryObject(request));
    const { items, pagination } = await listVoting(query);
    return ok({ items }, { requestId, pagination });
  });
}
