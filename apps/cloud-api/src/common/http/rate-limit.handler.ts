import { PROBLEM_JSON_CONTENT_TYPE, type ProblemDetails } from '@cbt/shared-types';
import type { HttpRequest, HttpResponse } from './http-types';

/** Minimal view of the `rateLimit` object `express-rate-limit` puts on the request. */
interface RateLimitedRequest extends HttpRequest {
  rateLimit?: { resetTime?: Date };
}

/**
 * Rate-limit response handler. The limiter runs as Express middleware (before
 * Nest routing), so its default plain-text 429 would bypass the global exception
 * filter. This sends a `problem+json` body instead, matching API spec section
 * 1.4, reuses the request id assigned by the request-id middleware, and adds the
 * `Retry-After` header the spec asks for.
 */
export function problemRateLimitHandler() {
  return (req: RateLimitedRequest, res: HttpResponse): void => {
    const resetTime = req.rateLimit?.resetTime;
    if (resetTime) {
      const seconds = Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
      res.setHeader('retry-after', String(seconds));
    }

    const body: ProblemDetails = {
      type: 'https://docs.cbt.example/errors/rate-limited',
      title: 'Rate limited',
      status: 429,
      code: 'RATE_LIMITED',
      detail: 'Too many requests, please try again later.',
      request_id: req.requestId ?? 'unknown',
    };
    res.status(429);
    res.setHeader('content-type', PROBLEM_JSON_CONTENT_TYPE);
    res.json(body);
  };
}
