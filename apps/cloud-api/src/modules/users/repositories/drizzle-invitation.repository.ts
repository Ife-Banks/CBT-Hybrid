import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { DrizzleDB } from '../../../shared/database/drizzle.service';
import { invitations } from '@cbt/shared-types';
import type { InvitationRecord, CreateInvitationDto } from '../domain/types';
import { mapInvitationFromDb } from '../domain/mappers';

export interface InvitationRepository {
  findById(id: string): Promise<InvitationRecord | null>;
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  findBySchoolId(schoolId: string): Promise<InvitationRecord[]>;
  findByUserId(userId: string): Promise<InvitationRecord[]>;
  findPendingByGuardianId(guardianId: string): Promise<InvitationRecord[]>;
  create(dto: CreateInvitationDto, schoolId: string, tokenHash: string, createdBy: string): Promise<InvitationRecord>;
  markAsUsed(id: string): Promise<InvitationRecord>;
  markAsSent(id: string): Promise<InvitationRecord>;
  markAsExpired(id: string): Promise<InvitationRecord>;
  revoke(id: string): Promise<InvitationRecord>;
}

@Injectable()
export class DrizzleInvitationRepository implements InvitationRepository {
  constructor(private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<InvitationRecord | null> {
    const row = await this.db.query.invitations.findFirst({
      where: eq(invitations.id, id),
    });
    return row ? mapInvitationFromDb(row) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    const row = await this.db.query.invitations.findFirst({
      where: and(
        eq(invitations.tokenHash, tokenHash),
        eq(invitations.status, 'pending'),
      ),
    });
    return row ? mapInvitationFromDb(row) : null;
  }

  async findBySchoolId(schoolId: string): Promise<InvitationRecord[]> {
    const rows = await this.db.query.invitations.findMany({
      where: eq(invitations.schoolId, schoolId),
      orderBy: [desc(invitations.createdAt)],
    });
    return rows.map(mapInvitationFromDb);
  }

  async findByUserId(userId: string): Promise<InvitationRecord[]> {
    const rows = await this.db.query.invitations.findMany({
      where: eq(invitations.userId, userId),
      orderBy: [desc(invitations.createdAt)],
    });
    return rows.map(mapInvitationFromDb);
  }

  async findPendingByGuardianId(guardianId: string): Promise<InvitationRecord[]> {
    const rows = await this.db.query.invitations.findMany({
      where: and(
        eq(invitations.guardianId, guardianId),
        eq(invitations.status, 'pending'),
      ),
      orderBy: [desc(invitations.createdAt)],
    });
    return rows.map(mapInvitationFromDb);
  }

  async create(dto: CreateInvitationDto, schoolId: string, tokenHash: string, createdBy: string): Promise<InvitationRecord> {
    const rows = await this.db
      .insert(invitations)
      .values({
        id: crypto.randomUUID(),
        schoolId,
        kind: dto.kind,
        channel: dto.channel,
        sentTo: dto.sentTo,
        guardianId: dto.guardianId ?? null,
        tokenHash,
        status: 'pending',
        expiresAt: dto.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
        createdBy,
      })
      .returning();

    if (!rows[0]) {
      throw new Error('Failed to create invitation');
    }

    return mapInvitationFromDb(rows[0]);
  }

  async markAsUsed(id: string): Promise<InvitationRecord> {
    const rows = await this.db
      .update(invitations)
      .set({
        status: 'used',
        usedAt: new Date(),
      })
      .where(eq(invitations.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Invitation with ID ${id} not found`);
    }

    return mapInvitationFromDb(rows[0]);
  }

  async markAsSent(id: string): Promise<InvitationRecord> {
    const rows = await this.db
      .update(invitations)
      .set({
        status: 'sent',
      })
      .where(eq(invitations.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Invitation with ID ${id} not found`);
    }

    return mapInvitationFromDb(rows[0]);
  }

  async markAsExpired(id: string): Promise<InvitationRecord> {
    const rows = await this.db
      .update(invitations)
      .set({
        status: 'expired',
      })
      .where(eq(invitations.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Invitation with ID ${id} not found`);
    }

    return mapInvitationFromDb(rows[0]);
  }

  async revoke(id: string): Promise<InvitationRecord> {
    const rows = await this.db
      .update(invitations)
      .set({
        status: 'revoked',
      })
      .where(eq(invitations.id, id))
      .returning();

    if (!rows[0]) {
      throw new NotFoundException(`Invitation with ID ${id} not found`);
    }

    return mapInvitationFromDb(rows[0]);
  }
}
