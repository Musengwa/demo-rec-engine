import Fastify from "fastify";
import { config } from "./config";
import { feedRoute } from "./routes/feed";
import { exploreRoute } from "./routes/explore";
import { mixesRoute } from "./routes/mixes";
import { similarRoute } from "./routes/similar";
import { interactionsRoute } from "./routes/interactions";
import { venuesRoute } from "./routes/venues";
import { pushTokensRoute } from "./routes/pushTokens";
import { scheduleJobs } from "./jobs/refreshPairAffinity";
import { scheduleNotificationJob } from "./jobs/notifyNewListings";
import { resolveAuthContext } from "./middleware/auth";

async function main() {
  const app = Fastify({
    logger:
      config.server.nodeEnv === "development"
        ? { transport: { target: "pino-pretty" } }
        : true,
  });

  // basic observability: log every request with endpoint, latency, and
  // whether the caller was a guest or an authenticated user (see design
  // doc Section 8.1). Which path (personalized vs cold_start) served the
  // request is logged separately by each route via the response body's
  // `source` field, visible in the response log line below.
  app.addHook("onRequest", async (request) => {
    (request as any)._startTime = Date.now();
  });

  app.addHook("onResponse", async (request, reply) => {
    const auth = resolveAuthContext(request);
    const elapsedMs = Date.now() - ((request as any)._startTime ?? Date.now());
    app.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        elapsedMs,
        caller: auth.isGuest ? "guest" : auth.userId,
      },
      "request completed"
    );
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(feedRoute);
  await app.register(exploreRoute);
  await app.register(mixesRoute);
  await app.register(similarRoute);
  await app.register(interactionsRoute);
  await app.register(venuesRoute);
  await app.register(pushTokensRoute);

  scheduleJobs(app.log);
  scheduleNotificationJob(app.log);

  await app.listen({ port: config.server.port, host: "0.0.0.0" });
  app.log.info(`Recommendation engine listening on port ${config.server.port}`);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
