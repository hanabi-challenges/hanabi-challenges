import type { ClientConfig } from 'pg';

function shouldUseSslFromUrl(connectionString: string): boolean {
  try {
    const hostname = new URL(connectionString).hostname.toLowerCase();
    // Render external Postgres hosts require TLS.
    return hostname.includes('.render.com') || hostname.includes('.onrender.com');
  } catch {
    return false;
  }
}

function shouldUseSslFromMode(modeRaw: string | undefined): boolean | null {
  if (!modeRaw) return null;
  const mode = modeRaw.trim().toLowerCase();
  if (!mode) return null;
  if (mode === 'disable') return false;
  return true;
}

export function buildPgClientConfig(
  connectionString: string,
): Pick<ClientConfig, 'connectionString' | 'ssl'> {
  const modeDecision = shouldUseSslFromMode(process.env.PGSSLMODE);
  const useSsl = modeDecision ?? shouldUseSslFromUrl(connectionString);

  if (!useSsl) {
    return { connectionString };
  }

  return {
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  };
}
