/**
 * Minimal HTTP interfaces. We deliberately avoid depending on `@types/express`
 * in application code: Nest gives us the raw Express objects at runtime, and we
 * only touch a small, stable surface.
 */

export interface HttpRequest {
  method: string;
  originalUrl: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  /** Parsed cookies, attached lazily by {@link parseCookies}. */
  cookies?: Record<string, string>;
  /** Client IP, as reported by Express. */
  ip?: string;
  /** Correlation id attached by the logging interceptor. */
  requestId?: string;
}

export interface HttpResponse {
  statusCode: number;
  setHeader(name: string, value: string | string[]): void;
  status(code: number): HttpResponse;
  json(body: unknown): unknown;
}
