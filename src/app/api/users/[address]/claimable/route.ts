import { ok, respond } from "@/lib/api";
import { getClaimable } from "@/lib/chain";
import { addressParamSchema } from "@/lib/validation";

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }) {
  return respond(async (requestId) => {
    const { address } = addressParamSchema.parse(await context.params);
    return ok(await getClaimable(address), { requestId });
  });
}
