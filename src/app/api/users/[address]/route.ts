import { ok, respond } from "@/lib/api";
import { getUser } from "@/lib/services";
import { addressParamSchema } from "@/lib/validation";

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }) {
  return respond(async (requestId) => ok(await getUser(addressParamSchema.parse(await context.params).address), { requestId }));
}
