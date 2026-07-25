import { FastifyInstance } from "fastify";
import { resolveAuthContext } from "../middleware/auth";
import { recordInteraction } from "../data/interactions";
import { invalidateForUser } from "../lib/cache";
import { InteractionPayload, InteractionResponse } from "../types";

const VALID_ACTIONS = new Set(["view", "like", "save", "unlike", "unsave"]);

export async function interactionsRoute(app: FastifyInstance) {
  app.post("/api/interactions", async (request, reply) => {
    const auth = resolveAuthContext(request);

    // Guests can browse, but interactions require an identity to attach to —
    // this is a write, not a read, so it's the one place we do reject rather
    // than silently no-op. The frontend should simply not call this while
    // logged out (or should prompt login at that point).
    if (auth.isGuest || !auth.userId) {
      return reply.status(401).send({ ok: false, error: "Login required to record interactions." });
    }

    const payload = request.body as InteractionPayload;
    if (!payload?.listingId || !VALID_ACTIONS.has(payload.action)) {
      return reply.status(400).send({ ok: false, error: "Invalid interaction payload." });
    }

    const row = await recordInteraction(auth.userId, payload);
    invalidateForUser(auth.userId); // this user's feed/explore/mixes are now stale

    const body: InteractionResponse = { ok: true, interactionId: row.id };
    return reply.send(body);
  });
}
