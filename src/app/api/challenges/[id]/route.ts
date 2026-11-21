import { ok, respond } from "@/lib/api";
import { getChallenge } from "@/lib/services";
import { idParamSchema } from "@/lib/validation";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async (requestId) => ok(await getChallenge(idParamSchema.parse(await context.params).id), { requestId }));
}
