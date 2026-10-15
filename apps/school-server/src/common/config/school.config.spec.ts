import { afterEach, describe, expect, it } from 'vitest';
import { EXAM_PACK_FOLDERS, loadSchoolEnv } from './school.config';
import { SchoolConfigService } from './school-config.service';

const touched: string[] = [];
function setEnv(key: string, value: string): void {
  if (!touched.includes(key)) touched.push(key);
  process.env[key] = value;
}
afterEach(() => {
  for (const key of touched.splice(0)) delete process.env[key];
});

describe('loadSchoolEnv', () => {
  it('applies defaults', () => {
    const env = loadSchoolEnv({} as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(8080);
    expect(env.CBT_DATA_DIR).toBe('./data');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('reads and coerces provided values', () => {
    const env = loadSchoolEnv({
      PORT: '9090',
      CBT_DATA_DIR: 'D:/cbt-data',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(9090);
    expect(env.CBT_DATA_DIR).toBe('D:/cbt-data');
  });

  it('treats a blank school-server port as unset', () => {
    const env = loadSchoolEnv({ SCHOOL_SERVER_PORT: '' } as unknown as NodeJS.ProcessEnv);
    expect(env.SCHOOL_SERVER_PORT).toBeUndefined();
  });

  it('fails fast on invalid configuration', () => {
    expect(() => loadSchoolEnv({ PORT: 'x' } as unknown as NodeJS.ProcessEnv)).toThrow(
      /Invalid school-server configuration/,
    );
  });

  it('defines the four exam-pack folders', () => {
    expect(EXAM_PACK_FOLDERS).toEqual(['pending', 'active', 'completed', 'archive']);
  });
});

describe('SchoolConfigService.port', () => {
  it('falls back to PORT', () => {
    expect(new SchoolConfigService().port).toBe(8080);
  });

  it('prefers SCHOOL_SERVER_PORT when set', () => {
    setEnv('SCHOOL_SERVER_PORT', '8123');
    expect(new SchoolConfigService().port).toBe(8123);
  });
});
