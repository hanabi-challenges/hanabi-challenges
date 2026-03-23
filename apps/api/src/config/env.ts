import dotenv from 'dotenv';

dotenv.config();

const BACKEND_PORT = Number(process.env.PORT || process.env.BACKEND_PORT) || 4000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}

// When true, the mock hanab-live routes are mounted on the API server and
// simulation scripts can write games via simulateGame().  Never set in prod.
const SIMULATION_MODE = process.env.SIMULATION_MODE === 'true';

export const env = {
  BACKEND_PORT,
  DATABASE_URL,
  JWT_SECRET,
  SIMULATION_MODE,
};
