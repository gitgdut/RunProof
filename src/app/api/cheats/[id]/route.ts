import { ok, respond } from "@/lib/api";
import { getCheat } from "@/lib/services";
import { idParamSchema } from "@/lib/validation";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async (requestId) => ok(await getCheat(idParamSchema.parse(await context.params).id), { requestId }));
}
