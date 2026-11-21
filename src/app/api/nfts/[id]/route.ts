import { ok, respond } from "@/lib/api";
import { getNft } from "@/lib/services";
import { idParamSchema } from "@/lib/validation";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async (requestId) => {
    const { id } = idParamSchema.parse(await context.params);
    return ok(await getNft(id), { requestId });
  });
}
