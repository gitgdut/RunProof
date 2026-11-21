import { ok, queryObject, respond } from "@/lib/api";
import { listNfts } from "@/lib/services";
import { listNftsSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => {
    const { items, pagination } = await listNfts(listNftsSchema.parse(queryObject(request)));
    return ok({ items }, { requestId, pagination });
  });
}
