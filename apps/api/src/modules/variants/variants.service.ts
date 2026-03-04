import { pool } from '../../config/db';

const VARIANTS_SOURCE_URL =
  'https://raw.githubusercontent.com/Hanabi-Live/hanabi-live/main/misc/variants.txt';
const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export type HanabiVariant = {
  code: number;
  name: string;
  label: string;
};

let syncInFlight = false;
let syncTimer: NodeJS.Timeout | null = null;

export async function ensureVariantTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hanabi_variants (
      code INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      label TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hanabi_variant_sync_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      last_synced_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    INSERT INTO hanabi_variant_sync_state (id, last_synced_at)
    VALUES (1, NULL)
    ON CONFLICT (id) DO NOTHING
  `);
}

function parseVariantsText(raw: string): HanabiVariant[] {
  const variants: HanabiVariant[] = [];
  const lines = raw.split('\n').map((line) => line.trim());
  const matcher = /^(.*?)\s+\(#(\d+)\)$/;

  for (const line of lines) {
    if (!line) continue;
    const match = line.match(matcher);
    if (!match) continue;
    const name = match[1].trim();
    const code = Number(match[2]);
    if (!Number.isInteger(code)) continue;
    variants.push({
      code,
      name,
      label: `${name} (#${code})`,
    });
  }

  return variants;
}

export async function syncHanabiVariants(): Promise<{
  fetched_count: number;
  stored_count: number;
  synced_at: string;
}> {
  if (syncInFlight) {
    const { last_synced_at } = await getVariantSyncState();
    return {
      fetched_count: 0,
      stored_count: 0,
      synced_at: last_synced_at ?? new Date().toISOString(),
    };
  }

  syncInFlight = true;
  try {
    await ensureVariantTables();
    const response = await fetch(VARIANTS_SOURCE_URL);
    if (!response.ok) {
      throw new Error(`Variant source fetch failed: HTTP ${response.status}`);
    }
    const raw = await response.text();
    const variants = parseVariantsText(raw);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const variant of variants) {
        await client.query(
          `
          INSERT INTO hanabi_variants (code, name, label, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (code)
          DO UPDATE SET
            name = EXCLUDED.name,
            label = EXCLUDED.label,
            updated_at = NOW()
          `,
          [variant.code, variant.name, variant.label],
        );
      }

      if (variants.length > 0) {
        await client.query(`DELETE FROM hanabi_variants WHERE code <> ALL($1::int[])`, [
          variants.map((v) => v.code),
        ]);
      } else {
        await client.query(`DELETE FROM hanabi_variants`);
      }

      await client.query(
        `
        INSERT INTO hanabi_variant_sync_state (id, last_synced_at)
        VALUES (1, NOW())
        ON CONFLICT (id)
        DO UPDATE SET last_synced_at = EXCLUDED.last_synced_at
        `,
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const { last_synced_at } = await getVariantSyncState();
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM hanabi_variants`,
    );
    return {
      fetched_count: variants.length,
      stored_count: Number(countResult.rows[0]?.count ?? 0),
      synced_at: last_synced_at ?? new Date().toISOString(),
    };
  } finally {
    syncInFlight = false;
  }
}

export async function listHanabiVariants(): Promise<HanabiVariant[]> {
  await ensureVariantTables();
  const result = await pool.query<HanabiVariant>(
    `
    SELECT code, name, label
    FROM hanabi_variants
    ORDER BY code
    `,
  );
  return result.rows;
}

export async function getVariantSyncState(): Promise<{ last_synced_at: string | null }> {
  await ensureVariantTables();
  const result = await pool.query<{ last_synced_at: string | null }>(
    `SELECT last_synced_at FROM hanabi_variant_sync_state WHERE id = 1`,
  );
  return { last_synced_at: result.rows[0]?.last_synced_at ?? null };
}

export function startVariantSyncScheduler(): void {
  if (syncTimer) return;

  void syncHanabiVariants().catch(() => {
    // Startup sync errors are non-fatal; manual sync endpoint can recover.
  });

  syncTimer = setInterval(() => {
    void syncHanabiVariants().catch(() => {
      // Best-effort periodic sync
    });
  }, SYNC_INTERVAL_MS);
  syncTimer.unref();
}
