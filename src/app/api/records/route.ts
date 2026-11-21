import { ok, queryObject, readJson, respond } from "@/lib/api";
import { prepareSubmission } from "@/lib/chain";
import { listRecords } from "@/lib/services";
import { listRecordsSchema, submissionPlanSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => {
    const query = listRecordsSchema.parse(queryObject(request));
    const { items, pagination } = await listRecords(query);
    return ok({ items }, { requestId, pagination });
  });
}

/**
 * Returns an unsigned `submitRecord` transaction. The backend never signs or broadcasts:
 * the player's wallet does, and the record only exists once RecordSubmitted is indexed.
 */
export async function POST(request: Request) {
  return respond(async (requestId) => {
    const input = submissionPlanSchema.parse(await readJson(request));
    return ok(await prepareSubmission(input), { requestId });
  });
}
