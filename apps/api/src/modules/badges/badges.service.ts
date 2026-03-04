import { pool } from '../../config/db';

export type BadgeShape =
  | 'circle'
  | 'rounded-square'
  | 'rounded-hexagon'
  | 'diamond-facet'
  | 'rosette';

export type BadgeTierKey = 'gold' | 'silver' | 'bronze' | 'participant';
export type BadgeTierSize = 'small' | 'large';
export type BadgeTierConfig = Record<BadgeTierKey, { included: boolean; size: BadgeTierSize }>;

export type BadgeSet = {
  id: number;
  name: string;
  shape: BadgeShape;
  symbol: string;
  icon_path: string | null;
  main_text: string;
  secondary_text: string;
  preview_svg: string;
  tier_config_json: BadgeTierConfig;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type BadgeSetAttachment = {
  event_id: number;
  event_slug: string;
  event_name: string;
  event_published: boolean;
  purpose: 'season_overall' | 'session_winner' | 'challenge_overall';
  sort_order: number;
};

export type BadgeSetWithAttachments = BadgeSet & {
  attachments: BadgeSetAttachment[];
};

export async function listBadgeSets(): Promise<BadgeSetWithAttachments[]> {
  const setsResult = await pool.query<BadgeSet>(
    `
    SELECT
      id,
      name,
      shape,
      symbol,
      icon_path,
      main_text,
      secondary_text,
      preview_svg,
      tier_config_json,
      created_by_user_id,
      created_at,
      updated_at
    FROM badge_sets
    ORDER BY updated_at DESC, id DESC
    `,
  );

  const linksResult = await pool.query<BadgeSetAttachment & { badge_set_id: number }>(
    `
    SELECT
      l.badge_set_id,
      l.event_id,
      e.slug AS event_slug,
      e.name AS event_name,
      e.published AS event_published,
      l.purpose,
      l.sort_order
    FROM event_badge_set_links l
    JOIN events e ON e.id = l.event_id
    ORDER BY l.badge_set_id, l.sort_order, l.id
    `,
  );

  const attachmentsBySetId = new Map<number, BadgeSetAttachment[]>();
  linksResult.rows.forEach((row) => {
    const existing = attachmentsBySetId.get(row.badge_set_id) ?? [];
    existing.push({
      event_id: row.event_id,
      event_slug: row.event_slug,
      event_name: row.event_name,
      event_published: row.event_published,
      purpose: row.purpose,
      sort_order: row.sort_order,
    });
    attachmentsBySetId.set(row.badge_set_id, existing);
  });

  return setsResult.rows.map((set) => ({
    ...set,
    attachments: attachmentsBySetId.get(set.id) ?? [],
  }));
}

export async function getBadgeSetById(id: number): Promise<BadgeSetWithAttachments | null> {
  const result = await pool.query<BadgeSet>(
    `
    SELECT
      id,
      name,
      shape,
      symbol,
      icon_path,
      main_text,
      secondary_text,
      preview_svg,
      tier_config_json,
      created_by_user_id,
      created_at,
      updated_at
    FROM badge_sets
    WHERE id = $1
    `,
    [id],
  );

  if (result.rowCount === 0) return null;
  const set = result.rows[0];

  const links = await pool.query<BadgeSetAttachment>(
    `
    SELECT
      l.event_id,
      e.slug AS event_slug,
      e.name AS event_name,
      e.published AS event_published,
      l.purpose,
      l.sort_order
    FROM event_badge_set_links l
    JOIN events e ON e.id = l.event_id
    WHERE l.badge_set_id = $1
    ORDER BY l.sort_order, l.id
    `,
    [id],
  );

  return {
    ...set,
    attachments: links.rows,
  };
}

export async function createBadgeSet(input: {
  name: string;
  shape: BadgeShape;
  symbol: string;
  icon_path?: string | null;
  main_text: string;
  secondary_text: string;
  preview_svg: string;
  tier_config_json: BadgeTierConfig;
  created_by_user_id?: number | null;
}): Promise<BadgeSetWithAttachments> {
  let safeCreatedByUserId: number | null = input.created_by_user_id ?? null;
  if (safeCreatedByUserId != null) {
    const userCheck = await pool.query<{ id: number }>(`SELECT id FROM users WHERE id = $1`, [
      safeCreatedByUserId,
    ]);
    if (userCheck.rowCount === 0) {
      safeCreatedByUserId = null;
    }
  }

  const result = await pool.query<BadgeSet>(
    `
    INSERT INTO badge_sets (
      name,
      shape,
      symbol,
      icon_path,
      main_text,
      secondary_text,
      preview_svg,
      tier_config_json,
      created_by_user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING
      id,
      name,
      shape,
      symbol,
      icon_path,
      main_text,
      secondary_text,
      preview_svg,
      tier_config_json,
      created_by_user_id,
      created_at,
      updated_at
    `,
    [
      input.name,
      input.shape,
      input.symbol,
      input.icon_path ?? null,
      input.main_text,
      input.secondary_text,
      input.preview_svg,
      input.tier_config_json,
      safeCreatedByUserId,
    ],
  );

  return {
    ...result.rows[0],
    attachments: [],
  };
}

export async function updateBadgeSetById(
  id: number,
  input: {
    name?: string;
    shape?: BadgeShape;
    symbol?: string;
    icon_path?: string | null;
    main_text?: string;
    secondary_text?: string;
    preview_svg?: string;
    tier_config_json?: BadgeTierConfig;
  },
): Promise<BadgeSetWithAttachments | null> {
  const existing = await getBadgeSetById(id);
  if (!existing) return null;

  const result = await pool.query<BadgeSet>(
    `
    UPDATE badge_sets
    SET
      name = $1,
      shape = $2,
      symbol = $3,
      icon_path = $4,
      main_text = $5,
      secondary_text = $6,
      preview_svg = $7,
      tier_config_json = $8,
      updated_at = NOW()
    WHERE id = $9
    RETURNING
      id,
      name,
      shape,
      symbol,
      icon_path,
      main_text,
      secondary_text,
      preview_svg,
      tier_config_json,
      created_by_user_id,
      created_at,
      updated_at
    `,
    [
      input.name ?? existing.name,
      input.shape ?? existing.shape,
      input.symbol ?? existing.symbol,
      input.icon_path !== undefined ? input.icon_path : existing.icon_path,
      input.main_text ?? existing.main_text,
      input.secondary_text ?? existing.secondary_text,
      input.preview_svg ?? existing.preview_svg,
      input.tier_config_json ?? existing.tier_config_json,
      id,
    ],
  );

  return {
    ...result.rows[0],
    attachments: existing.attachments,
  };
}

export async function deleteBadgeSetById(id: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM badge_sets WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function badgeSetExists(id: number): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM badge_sets WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
