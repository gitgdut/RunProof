import { ok, queryObject, respond } from "@/lib/api";
import { listNfts } from "@/lib/services";
import { listNftsSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => {
    const query = listNftsSchema.parse(queryObject(request));
    const { items, pagination } = await listNfts(query);
    return ok({ items }, { requestId, pagination });
  });
}
