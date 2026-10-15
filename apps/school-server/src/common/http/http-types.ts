/**
 * Minimal HTTP interfaces (same shape as the cloud API's). We avoid depending on
 * `@types/express` in application code.
 */

export interface HttpRequest {
  method: string;
  originalUrl: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
}

export interface HttpResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  status(code: number): HttpResponse;
  json(body: unknown): unknown;
}
