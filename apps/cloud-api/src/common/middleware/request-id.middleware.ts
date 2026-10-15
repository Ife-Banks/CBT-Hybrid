import { uuidv7 } from '@cbt/shared-types';
import type { HttpRequest, HttpResponse } from '../http/http-types';

/**
 * Assigns a correlation id to every request before any other middleware runs,
 * so even requests rejected by the rate limiter carry an id. Reuses an inbound
 * `x-request-id` when present. The id is echoed in the response header.
 */
export function requestIdMiddleware() {
  return (req: HttpRequest, res: HttpResponse, next: () => void): void => {
    const inbound = req.headers['x-request-id'];
    const id =
      (typeof inbound === 'string' && inbound.length > 0 ? inbound : undefined) ?? uuidv7();
    req.requestId = id;
    res.setHeader('x-request-id', id);
    next();
  };
}
