import { apiRoute, readJson } from "@/server/http/api";
import { confirmServiceVerification } from "@/server/mail";
import { applyEmailChange, setVerifiedOwnEmail } from "@/server/services/users";
import { consumeChallenge } from "@/server/services/verification";
import { parseInput, z } from "@/server/validation/zod";

const schema = z.object({ token: z.string().min(10).max(200), code: z.string().max(20) });

export const POST = apiRoute(["owner"], async ({ req, ctx }) => {
  const data = parseInput(schema, await readJson(req));
  if (data.token.startsWith("svc:")) {
    const email = data.token.slice(4);
    await confirmServiceVerification(ctx.db, email, data.code, false);
    return { user: setVerifiedOwnEmail(ctx, email) };
  }
  const row = consumeChallenge(ctx, data.token, data.code, "change_email");
  return { user: applyEmailChange(ctx, row) };
});
