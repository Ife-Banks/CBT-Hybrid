import { Injectable, Logger } from '@nestjs/common';

export interface HttpResponse<T = unknown> {
  ok: boolean;
  data?: T | null;
  error?: string;
  status?: number;
}

@Injectable()
export class HttpClient {
  private readonly logger = new Logger(HttpClient.name);

  async get<T = unknown>(url: string): Promise<HttpResponse<T>> {
    try {
      this.logger.debug(`GET ${url}`);
      const response = await fetch(url);
      const data = response.ok ? await response.json().catch(() => null) : null;

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}`, status: response.status };
      }

      return { ok: true, data: data as T };
    } catch (error) {
      this.logger.error(`GET ${url} failed`, error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async post<T = unknown>(url: string, body: unknown): Promise<HttpResponse<T>> {
    try {
      this.logger.debug(`POST ${url}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = response.ok ? await response.json().catch(() => null) : null;

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}`, status: response.status };
      }

      return { ok: true, data: data as T };
    } catch (error) {
      this.logger.error(`POST ${url} failed`, error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}