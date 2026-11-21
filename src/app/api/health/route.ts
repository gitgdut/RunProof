import { ok, respond } from "@/lib/api";
import { getHealth } from "@/lib/services";

export async function GET() {
  return respond(async (requestId) => ok(await getHealth(), { requestId }));
}
