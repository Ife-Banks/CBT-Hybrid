import type { Config } from 'drizzle-kit';

export default {
  schema: '../../packages/shared-types/src/db/schema.ts',
  out: './src/shared/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://cbt_app:password@localhost:5432/cbt_cloud',
  },
} satisfies Config;
