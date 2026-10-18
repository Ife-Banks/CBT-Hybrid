import { networkInterfaces } from 'node:os';

/** LAN address and port the exam clients should use. */
export interface ServerAddress {
  url: string;
  host: string;
  port: number;
}

/**
 * First non-loopback, non-link-local IPv4 address of this machine. Falls back to
 * `127.0.0.1` so the setup page always shows something usable (spec 6.6).
 */
export function lanAddress(): string {
  const interfaces = networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      if (address.address.startsWith('169.254.')) continue;
      return address.address;
    }
  }
  return '127.0.0.1';
}

/** `http://<lan-ip>:<port>` for the given port. */
export function serverAddress(port: number, host = lanAddress()): ServerAddress {
  return { url: `http://${host}:${port}`, host, port };
}
