import { z } from 'zod';

/** Health of a single dependency or subsystem. */
export const ServiceHealthSchema = z.object({
  status: z.enum(['ok', 'error', 'degraded']),
  /** Measured response time, for example `45ms`. */
  responseTime: z.string().optional(),
  /** Extra context on failure or degradation. */
  details: z.string().optional(),
});

export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;

/**
 * `GET /health` response. `services` carries one entry per checked dependency
 * (database, redis, filesystem, ...). `status` is `ok` only when every service
 * is `ok`.
 */
export const HealthCheckSchema = z.object({
  status: z.enum(['ok', 'error']),
  service: z.string(),
  version: z.string(),
  timestamp: z.iso.datetime(),
  /** Human-readable uptime, for example `2h 34m 12s`. */
  uptime: z.string(),
  services: z.record(z.string(), ServiceHealthSchema),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;
