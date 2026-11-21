import { ok, queryObject, readJson, respond } from "@/lib/api";
import { verifyRecordSignature } from "@/lib/auth";
import { createRecord, listRecords } from "@/lib/services";
import { createRecordSchema, listRecordsSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => {
    const query = listRecordsSchema.parse(queryObject(request));
    const { items, pagination } = await listRecords(query);
    return ok({ items }, { requestId, pagination });
  });
}

export async function POST(request: Request) {
  return respond(async (requestId) => {
    const input = createRecordSchema.parse(await readJson(request));
    await verifyRecordSignature(input);
    const { signature: _signature, expiresAt: _expiresAt, ...data } = input;
    const record = await createRecord(data);
    return ok(record, { requestId, status: 201 });
  });
}
