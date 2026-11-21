import { ok, respond } from "@/lib/api";
import { listCategories } from "@/lib/services";

export async function GET() {
  return respond(async (requestId) => ok(await listCategories(), { requestId }));
}
