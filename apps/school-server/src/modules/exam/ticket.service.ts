import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { problem } from '../../common/http/problem';

/** Claims carried by a login ticket (API spec 16.1). */
export interface TicketClaims {
  student_id: string;
  sitting_id: string;
  seat: string | null;
  /** Expiry, in Unix seconds. */
  exp: number;
}

/** Tickets are valid for 15 minutes (API spec 16.1). */
export const TICKET_TTL_SECONDS = 15 * 60;

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** Constant-time string comparison over the raw bytes. */
function equalsConstantTime(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Issues and verifies the short-lived, stateless ticket returned by `/login`.
 * Only `/start` accepts it; it is HMAC-SHA256 signed and carries no database
 * row, so a student who logs in but never presses Start leaves no trace.
 */
@Injectable()
export class TicketService {
  constructor(private readonly config: SchoolConfigService) {}

  issue(claims: Omit<TicketClaims, 'exp'>, now = Date.now()): string {
    const payload: TicketClaims = {
      ...claims,
      exp: Math.floor(now / 1000) + TICKET_TTL_SECONDS,
    };
    const body = encode(JSON.stringify(payload));
    return `${body}.${this.sign(body)}`;
  }

  /** Verify a ticket, throwing `AUTH_REQUIRED` when it is malformed or expired. */
  verify(ticket: string, now = Date.now()): TicketClaims {
    const parts = ticket.split('.');
    const body = parts[0];
    const mac = parts[1];
    if (!body || !mac || parts.length !== 2) {
      throw problem('AUTH_REQUIRED', 'Ticket is malformed');
    }
    if (!equalsConstantTime(mac, this.sign(body))) {
      throw problem('AUTH_REQUIRED', 'Ticket signature is invalid');
    }

    let claims: TicketClaims;
    try {
      claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TicketClaims;
    } catch {
      throw problem('AUTH_REQUIRED', 'Ticket is malformed');
    }

    if (
      typeof claims.exp !== 'number' ||
      typeof claims.student_id !== 'string' ||
      typeof claims.sitting_id !== 'string'
    ) {
      throw problem('AUTH_REQUIRED', 'Ticket is malformed');
    }
    if (claims.exp * 1000 <= now) {
      throw problem('AUTH_REQUIRED', 'Ticket has expired');
    }
    return claims;
  }

  private sign(body: string): string {
    return createHmac('sha256', this.config.ticketSigningSecret).update(body).digest('base64url');
  }
}
