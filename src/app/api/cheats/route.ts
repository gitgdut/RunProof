import { ok, queryObject, readJson, respond } from "@/lib/api";
import { verifyCheatSignature } from "@/lib/auth";
import { createCheat, listCheats } from "@/lib/services";
import { createCheatSchema, listCheatsSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => {
    const { items, pagination } = await listCheats(listCheatsSchema.parse(queryObject(request)));
    return ok({ items }, { requestId, pagination });
  });
}

export async function POST(request: Request) {
  return respond(async (requestId) => {
    const input = createCheatSchema.parse(await readJson(request));
    await verifyCheatSignature(input);
    const { signature: _signature, expiresAt: _expiresAt, adminAddress: _adminAddress, ...data } = input;
    return ok(await createCheat(data), { requestId, status: 201 });
  });
}
