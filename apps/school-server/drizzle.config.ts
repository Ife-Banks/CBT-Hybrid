import type { Config } from 'drizzle-kit';

export default {
  schema: './src/shared/database/schema.ts',
  out: './src/shared/database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SCHOOL_DB_PATH || './data/school.db',
  },
} satisfies Config;
