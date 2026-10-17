import { Body, Controller, Get, Inject, Param, Post, Put, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { problem } from '../../common/http/problem';
import { bearerToken, clientIp, type ExamHttpRequest } from '../../common/http/exam-request';
import { ExamSessionService, type AnswerBatch } from './exam-session.service';
import { TicketService } from './ticket.service';
import { PackImportService } from './pack-import.service';
import { SessionTokenGuard, type SessionHttpRequest } from './guards/session-token.guard';
import { parseAnswers, parseEvent, parseLogin, parseSubmit, type AnswersDto } from './dto/exam.dto';
import type { AnswerChange } from './domain/types';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CATALOG_REPOSITORY, type CatalogRepository } from './repositories/catalog.repository';
import { PACK_REPOSITORY, type PackRepository } from './repositories/pack.repository';
import { SESSION_REPOSITORY, type SessionRepository } from './repositories/session.repository';
import { Buffer } from 'node:buffer';

/**
 * School Exam API (API spec section 16). Plain HTTP on the isolated lab
 * network; students authenticate with a short-lived ticket and then a session
 * token.
 */
@ApiTags('exam')
@ApiBearerAuth()
@Controller('api/v1/exam')
export class ExamController {
  constructor(
    private readonly sessions: ExamSessionService,
    private readonly tickets: TicketService,
    private readonly packImport: PackImportService,
    @Inject(CATALOG_REPOSITORY) private readonly catalogRepo: CatalogRepository,
    @Inject(PACK_REPOSITORY) private readonly packRepo: PackRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: SessionRepository,
  ) {}

  /** `GET /status` - public login-screen info. */
  @Get('status')
  @ApiOperation({ summary: 'Get login screen status', description: 'Returns school name, server time, open sittings, and seat info for the client IP' })
  @ApiResponse({ status: 200, description: 'Login screen status' })
  status(@Req() request: ExamHttpRequest) {
    return this.sessions.getStatus(clientIp(request));
  }

  /** `POST /login` - student code plus exam key, returns a ticket. */
  @Post('login')
  @ApiOperation({ summary: 'Student login', description: 'Authenticate with student code and exam key, returns a ticket for starting a session' })
  @ApiResponse({ status: 201, description: 'Login successful, returns ticket' })
  @ApiResponse({ status: 400, description: 'Invalid student code format or exam key' })
  @ApiResponse({ status: 429, description: 'Seat locked due to too many failed attempts' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['student_code', 'exam_key'],
      properties: {
        student_code: { type: 'string', description: 'Student code' },
        exam_key: { type: 'string', description: 'Exam key' },
        seat: { type: 'string', description: 'Optional seat identifier' },
      },
    },
  })
  login(@Body() body: unknown, @Req() request: ExamHttpRequest) {
    const dto = parseLogin(body);
    return this.sessions.login(
      {
        studentCode: dto.student_code,
        examKey: dto.exam_key,
        seat: dto.seat ?? null,
      },
      clientIp(request),
    );
  }

  /** `POST /start` - creates the session from a ticket. */
  @Post('start')
  @ApiOperation({ summary: 'Start exam session', description: 'Creates a new exam session from a valid ticket, returns session token and questions' })
  @ApiResponse({ status: 201, description: 'Session started successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or missing ticket' })
  @ApiResponse({ status: 409, description: 'Student already submitted this exam' })
  start(@Req() request: ExamHttpRequest) {
    const token = bearerToken(request);
    if (!token) {
      throw problem('AUTH_REQUIRED', 'A ticket is required');
    }
    return this.sessions.start(this.tickets.verify(token), clientIp(request));
  }

  /** `GET /session` - questions plus saved answers. */
  @Get('session')
  @UseGuards(SessionTokenGuard)
  @ApiOperation({ summary: 'Get current session', description: 'Returns session info including questions, saved answers, and remaining time' })
  @ApiResponse({ status: 200, description: 'Session data' })
  @ApiResponse({ status: 401, description: 'Invalid or expired session token' })
  @ApiResponse({ status: 410, description: 'Session closed (submitted, expired, or reset)' })
  session(@Req() request: SessionHttpRequest) {
    return this.sessions.getSession(sessionOf(request), clientIp(request));
  }

  /** `PUT /session/answers` - batched, idempotent auto-save. */
  @Put('session/answers')
  @UseGuards(SessionTokenGuard)
  @ApiOperation({ summary: 'Save answers (auto-save)', description: 'Stores a batch of answer changes with sequence number for idempotency' })
  @ApiResponse({ status: 200, description: 'Answers saved successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired session token' })
  @ApiResponse({ status: 410, description: 'Session closed' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['seq', 'changes'],
      properties: {
        seq: { type: 'number', description: 'Sequence number for idempotency' },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['question_id', 'answer'],
            properties: {
              question_id: { type: 'string' },
              answer: { type: 'object' },
              flagged: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  answers(@Body() body: unknown, @Req() request: SessionHttpRequest) {
    const dto = parseAnswers(body);
    return this.sessions.saveAnswers(sessionOf(request), toBatch(dto), clientIp(request));
  }

  /** `POST /ping` - heartbeat that also reports extra time. */
  @Post('ping')
  @UseGuards(SessionTokenGuard)
  @ApiOperation({ summary: 'Session heartbeat', description: 'Updates last seen time and returns remaining time' })
  @ApiResponse({ status: 201, description: 'Ping successful' })
  @ApiResponse({ status: 401, description: 'Invalid or expired session token' })
  @ApiResponse({ status: 410, description: 'Session closed' })
  ping(@Req() request: SessionHttpRequest) {
    return this.sessions.ping(sessionOf(request), clientIp(request));
  }

  /** `POST /session/submit` - store any last changes, mark and close. */
  @Post('session/submit')
  @UseGuards(SessionTokenGuard)
  @ApiOperation({ summary: 'Submit exam session', description: 'Finalizes the session, stores any final answers, marks the exam, and returns the score' })
  @ApiResponse({ status: 201, description: 'Session submitted successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired session token' })
  @ApiResponse({ status: 410, description: 'Session already submitted' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        seq: { type: 'number', description: 'Sequence number' },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['question_id', 'answer'],
            properties: {
              question_id: { type: 'string' },
              answer: { type: 'object' },
              flagged: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  submit(@Body() body: unknown, @Req() request: SessionHttpRequest) {
    const dto = parseSubmit(body);
    const batch: AnswerBatch | null =
      dto.seq === undefined ? null : { seq: dto.seq, changes: toChanges(dto.changes) };
    return this.sessions.submit(sessionOf(request), batch, clientIp(request));
  }

  /** `GET /assets/:asset_id` - serve pack asset (Section 16.10). */
  @Get('assets/:asset_id')
  @UseGuards(SessionTokenGuard)
  @ApiOperation({ summary: 'Get exam asset', description: 'Returns an asset file (image, audio, etc.) from the exam pack' })
  @ApiResponse({ status: 200, description: 'Asset file', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 401, description: 'Invalid or expired session token' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  @ApiParam({ name: 'asset_id', description: 'Asset identifier' })
  async getAsset(@Param('asset_id') assetId: string, @Req() request: SessionHttpRequest) {
    const session = sessionOf(request);
    const sitting = await this.catalogRepo.findSitting(session.sittingId);
    if (!sitting) {
      throw problem('NOT_FOUND', 'Sitting not found');
    }
    const pack = await this.packRepo.findById(sitting.packId);
    if (!pack) {
      throw problem('NOT_FOUND', 'Pack not found');
    }

    const contents = await this.packImport.loadPack(pack.id);
    const assetFile = contents.manifest.files.find((file) => file.path === `assets/${assetId}`);
    if (!assetFile) {
      throw problem('NOT_FOUND', 'Asset not found in pack');
    }

    const assetPath = join(pack.dirPath, assetFile.path);
    const assetData = await readFile(assetPath);

    return new StreamableFile(Buffer.from(assetData), {
      type: 'application/octet-stream',
      disposition: `inline`,
      length: assetData.length,
    });
  }

  /** `POST /events` - client integrity events (Section 16.10). */
  @Post('events')
  @UseGuards(SessionTokenGuard)
  @ApiOperation({ summary: 'Post integrity event', description: 'Records client-side integrity events (focus lost, etc.)' })
  @ApiResponse({ status: 204, description: 'Event recorded' })
  @ApiResponse({ status: 401, description: 'Invalid or expired session token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'at'],
      properties: {
        type: { type: 'string', enum: ['focus_lost', 'focus_regained'] },
        at: { type: 'string', format: 'date-time' },
      },
    },
  })
  async postEvent(@Body() body: unknown, @Req() request: SessionHttpRequest) {
    const session = sessionOf(request);
    const dto = parseEvent(body);

    if (dto.type === 'focus_lost') {
      await this.sessionRepo.incrementFocusLostCount(session.id);
    }

    await this.sessionRepo.insertSessionEvent({
      sessionId: session.id,
      type: dto.type,
      at: dto.at,
    });

    return { status: 204 };
  }
}

function toChanges(changes: AnswersDto['changes']): AnswerChange[] {
  return changes.map((change) => ({
    questionId: change.question_id,
    answer: change.answer,
    flagged: change.flagged,
  }));
}

function toBatch(dto: AnswersDto): AnswerBatch {
  return { seq: dto.seq, changes: toChanges(dto.changes) };
}

function sessionOf(request: SessionHttpRequest) {
  if (!request.examSession) {
    throw problem('AUTH_REQUIRED', 'A session token is required');
  }
  return request.examSession;
}