import { FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { AuthContext } from "../types";

/**
 * Resolves the caller's auth state from the Authorization header.
 *
 * This never rejects a request for missing/invalid auth — per the design
 * doc, "no JWT" and "bad JWT" both just mean "treat as guest", and guests
 * are a first-class, fully-supported input (they get the cold-start path).
 * There is nothing here for a route to 401 on; every route works for
 * both guests and authenticated users.
 */
export function resolveAuthContext(request: FastifyRequest): AuthContext {
  const header = request.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return { isGuest: true, userId: null };
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const decoded = jwt.verify(token, config.supabase.jwtSecret) as { sub?: string };
    if (!decoded.sub) {
      return { isGuest: true, userId: null };
    }
    return { isGuest: false, userId: decoded.sub };
  } catch {
    // expired, malformed, wrong secret, etc — fall back to guest rather than error
    return { isGuest: true, userId: null };
  }
}
