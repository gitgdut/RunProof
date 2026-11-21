import { ok, queryObject, respond } from "@/lib/api";
import { listReasons } from "@/lib/services";
import { listReasonsSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => {
    const query = listReasonsSchema.parse(queryObject(request));
    const { items, pagination } = await listReasons(query);
    return ok({ items }, { requestId, pagination });
  });
}
