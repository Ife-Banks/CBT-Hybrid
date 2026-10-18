import { Controller, Get, Header, StreamableFile } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import { problem } from '../../common/http/problem';
import { resolveWebPage } from './web-pages';

/**
 * Serves the first-run setup wizard. Its CSS and JS are shipped next to the page
 * and served from `/static/`, so the page works under the strict CSP that helmet
 * applies to every response. The exam client is a static bundle served from the
 * root by `main.ts`.
 */
@ApiExcludeController()
@Controller()
export class WebController {
  @Get('setup')
  @Header('Content-Type', 'text/html; charset=utf-8')
  setup(): StreamableFile {
    const path = resolveWebPage('setup.html');
    if (!path) {
      throw problem('NOT_FOUND', 'Setup page is not installed');
    }
    return new StreamableFile(createReadStream(path));
  }
}
