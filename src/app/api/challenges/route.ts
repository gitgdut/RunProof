import { ok, queryObject, readJson, respond } from "@/lib/api";
import { verifyChallengeSignature } from "@/lib/auth";
import { createChallenge, listChallenges } from "@/lib/services";
import { createChallengeSchema, listChallengesSchema } from "@/lib/validation";

export async function GET(request: Request) {
  return respond(async (requestId) => {
    const { items, pagination } = await listChallenges(listChallengesSchema.parse(queryObject(request)));
    return ok({ items }, { requestId, pagination });
  });
}

export async function POST(request: Request) {
  return respond(async (requestId) => {
    const input = createChallengeSchema.parse(await readJson(request));
    await verifyChallengeSignature(input);
    const { signature: _signature, expiresAt: _expiresAt, ...data } = input;
    return ok(await createChallenge(data), { requestId, status: 201 });
  });
}
