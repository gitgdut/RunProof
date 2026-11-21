import { ok, queryObject, respond } from "@/lib/api";
import { listVoting } from "@/lib/services";
import { listVotingSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => {
    const { items, pagination } = await listVoting(listVotingSchema.parse(queryObject(request)));
    return ok({ items }, { requestId, pagination });
  });
}
