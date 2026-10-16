import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { SchoolConfigService } from '../../common/config/school-config.service';
import { TicketService } from './ticket.service';

function makeService(secret = 'unit-test-ticket-secret-0123456789'): TicketService {
  process.env.TICKET_SIGNING_SECRET = secret;
  const config = new SchoolConfigService();
  delete process.env.TICKET_SIGNING_SECRET;
  return new TicketService(config);
}

const claims = { student_id: 'student-1', sitting_id: 'sitting-1', seat: 'PC-12' };

describe('TicketService', () => {
  it('round-trips claims it issued', () => {
    const service = makeService();
    const ticket = service.issue(claims, Date.parse('2026-10-20T08:00:00.000Z'));
    const verified = service.verify(ticket, Date.parse('2026-10-20T08:05:00.000Z'));

    expect(verified.student_id).toBe('student-1');
    expect(verified.sitting_id).toBe('sitting-1');
    expect(verified.seat).toBe('PC-12');
  });

  it('produces a deterministic ticket for the same claims and instant', () => {
    const service = makeService();
    const first = service.issue(claims, 1_000);
    const second = service.issue(claims, 1_000);
    expect(first).toBe(second);
  });

  it('rejects a ticket signed with a different secret', () => {
    const issuer = makeService('secret-one-0123456789abcdef');
    const verifier = makeService('secret-two-0123456789abcdef');

    const ticket = issuer.issue(claims);

    expect(() => verifier.verify(ticket)).toThrow(HttpException);
  });

  it('rejects a tampered payload', () => {
    const service = makeService();
    const ticket = service.issue(claims);
    const mac = ticket.split('.')[1] as string;
    const forged = Buffer.from(
      JSON.stringify({ ...claims, student_id: 'someone-else', exp: 9_999_999_999 }),
      'utf8',
    ).toString('base64url');

    expect(() => service.verify(`${forged}.${mac}`)).toThrow(HttpException);
  });

  it('rejects an expired ticket', () => {
    const service = makeService();
    const ticket = service.issue(claims, 0);
    // Tickets last 15 minutes (API spec 16.1).
    expect(() => service.verify(ticket, 16 * 60 * 1000)).toThrow(HttpException);
  });

  it('rejects malformed tickets', () => {
    const service = makeService();
    for (const bad of ['', 'no-dot', 'a.b.c', 'onlybody.']) {
      expect(() => service.verify(bad)).toThrow(HttpException);
    }
  });

  it('throws AUTH_REQUIRED so the filter renders the right problem', () => {
    const service = makeService();
    try {
      service.verify('nonsense');
      throw new Error('expected the ticket to be rejected');
    } catch (error) {
      const response = (error as HttpException).getResponse() as { code: string };
      expect(response.code).toBe('AUTH_REQUIRED');
      expect((error as HttpException).getStatus()).toBe(401);
    }
  });
});
