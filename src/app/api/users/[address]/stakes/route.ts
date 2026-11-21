import { ok, queryObject, respond } from "@/lib/api";
import { getUserStakes } from "@/lib/services";
import { addressParamSchema, paginationSchema } from "@/lib/validation";

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  return respond(async (requestId) => {
    const { address } = addressParamSchema.parse(await context.params);
    const { items, pagination, withdrawals } = await getUserStakes(address, paginationSchema.parse(queryObject(request)));
    return ok({ items, withdrawals }, { requestId, pagination });
  });
}
