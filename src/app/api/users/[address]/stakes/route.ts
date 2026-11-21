import { ok, queryObject, respond } from "@/lib/api";
import { getUserStakeFlows } from "@/lib/services";
import { addressParamSchema, paginationSchema } from "@/lib/validation";

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  return respond(async (requestId) => {
    const { address } = addressParamSchema.parse(await context.params);
    const { items, pagination } = await getUserStakeFlows(address, paginationSchema.parse(queryObject(request)));
    return ok({ items }, { requestId, pagination });
  });
}
