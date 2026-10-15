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
  /** Correlation id attached by the logging interceptor. */
  requestId?: string;
}

export interface HttpResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  status(code: number): HttpResponse;
  json(body: unknown): unknown;
}
