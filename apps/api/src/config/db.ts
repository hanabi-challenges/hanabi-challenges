import { Pool } from 'pg';
import { env } from './env';
import { buildPgClientConfig } from './pg';

export const pool = new Pool(buildPgClientConfig(env.DATABASE_URL));
