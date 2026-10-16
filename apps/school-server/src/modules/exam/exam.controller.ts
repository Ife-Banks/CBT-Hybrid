import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { problem } from '../../common/http/problem';
import { bearerToken, clientIp, type ExamHttpRequest } from '../../common/http/exam-request';
import { ExamSessionService, type AnswerBatch } from './exam-session.service';
import { TicketService } from './ticket.service';
import { SessionTokenGuard, type SessionHttpRequest } from './guards/session-token.guard';
import { parseAnswers, parseLogin, parseSubmit, type AnswersDto } from './dto/exam.dto';
import type { AnswerChange } from './domain/types';

/**
 * School Exam API (API spec section 16). Plain HTTP on the isolated lab
 * network; students authenticate with a short-lived ticket and then a session
 * token.
 */
@Controller('api/v1/exam')
export class ExamController {
  constructor(
    private readonly sessions: ExamSessionService,
    private readonly tickets: TicketService,
  ) {}

  /** `GET /status` - public login-screen info. */
  @Get('status')
  status(@Req() request: ExamHttpRequest) {
    return this.sessions.getStatus(clientIp(request));
  }

  /** `POST /login` - student code plus exam key, returns a ticket. */
  @Post('login')
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
  session(@Req() request: SessionHttpRequest) {
    return this.sessions.getSession(sessionOf(request), clientIp(request));
  }

  /** `PUT /session/answers` - batched, idempotent auto-save. */
  @Put('session/answers')
  @UseGuards(SessionTokenGuard)
  answers(@Body() body: unknown, @Req() request: SessionHttpRequest) {
    const dto = parseAnswers(body);
    return this.sessions.saveAnswers(sessionOf(request), toBatch(dto), clientIp(request));
  }

  /** `POST /ping` - heartbeat that also reports extra time. */
  @Post('ping')
  @UseGuards(SessionTokenGuard)
  ping(@Req() request: SessionHttpRequest) {
    return this.sessions.ping(sessionOf(request), clientIp(request));
  }

  /** `POST /session/submit` - store any last changes, mark and close. */
  @Post('session/submit')
  @UseGuards(SessionTokenGuard)
  submit(@Body() body: unknown, @Req() request: SessionHttpRequest) {
    const dto = parseSubmit(body);
    const batch: AnswerBatch | null =
      dto.seq === undefined ? null : { seq: dto.seq, changes: toChanges(dto.changes) };
    return this.sessions.submit(sessionOf(request), batch, clientIp(request));
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
