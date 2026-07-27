import { FastifyInstance } from "fastify";
import { resolveAuthContext } from "../middleware/auth";
import { upsertPushToken } from "../data/pushTokens";

export async function pushTokensRoute(app: FastifyInstance) {
  app.post("/api/push-tokens", async (request, reply) => {
    const auth = resolveAuthContext(request);

    // registering a token only makes sense for a signed-in device
    if (auth.isGuest || !auth.userId) {
      return reply.status(401).send({ ok: false, error: "Login required to register a push token." });
    }

    const { token } = (request.body as { token?: string }) ?? {};
    if (!token) {
      return reply.status(400).send({ ok: false, error: "Missing token." });
    }

    await upsertPushToken(auth.userId, token);
    return reply.send({ ok: true });
  });
}
