import { Router, type Response } from 'express';
import { authRequired, AuthenticatedRequest, requireAdmin } from '../../middleware/authMiddleware';
import {
  createBadgeSet,
  deleteBadgeSetById,
  getBadgeSetById,
  listBadgeSets,
  updateBadgeSetById,
  type BadgeShape,
  type BadgeTierConfig,
} from './badges.service';
import { pool } from '../../config/db';

const router = Router();

const SHAPES: BadgeShape[] = [
  'circle',
  'rounded-square',
  'rounded-hexagon',
  'diamond-facet',
  'rosette',
];

function normalizeShape(value: unknown): BadgeShape | null {
  if (typeof value !== 'string') return null;
  return SHAPES.includes(value as BadgeShape) ? (value as BadgeShape) : null;
}

function isValidTierConfig(input: unknown): input is BadgeTierConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const obj = input as Record<string, unknown>;
  const keys = ['gold', 'silver', 'bronze', 'participant'];
  return keys.every((key) => {
    const tier = obj[key];
    if (!tier || typeof tier !== 'object' || Array.isArray(tier)) return false;
    const included = (tier as Record<string, unknown>).included;
    const size = (tier as Record<string, unknown>).size;
    return typeof included === 'boolean' && (size === 'small' || size === 'large');
  });
}

router.get(
  '/badge-sets',
  authRequired,
  requireAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const sets = await listBadgeSets();
      res.json({ sets });
    } catch (err) {
      console.error('Error listing badge sets:', err);
      res.status(500).json({ error: 'Failed to list badge sets' });
    }
  },
);

router.get(
  '/badge-sets/:id',
  authRequired,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid badge set id' });
    }

    try {
      const set = await getBadgeSetById(id);
      if (!set) return res.status(404).json({ error: 'Badge set not found' });
      res.json(set);
    } catch (err) {
      console.error('Error loading badge set:', err);
      res.status(500).json({ error: 'Failed to load badge set' });
    }
  },
);

router.post(
  '/badge-sets',
  authRequired,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const shape = normalizeShape(req.body?.shape);
    const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.trim() : '';
    const iconPath = typeof req.body?.icon_path === 'string' ? req.body.icon_path.trim() : null;
    const mainText = typeof req.body?.main_text === 'string' ? req.body.main_text : '';
    const secondaryText =
      typeof req.body?.secondary_text === 'string' ? req.body.secondary_text : '';
    const previewSvg = typeof req.body?.preview_svg === 'string' ? req.body.preview_svg : '';
    const tierConfig = req.body?.tier_config_json;

    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!shape) return res.status(400).json({ error: 'shape is invalid' });
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    if (!mainText.trim()) return res.status(400).json({ error: 'main_text is required' });
    if (!secondaryText.trim()) return res.status(400).json({ error: 'secondary_text is required' });
    if (!previewSvg.trim()) return res.status(400).json({ error: 'preview_svg is required' });
    if (!isValidTierConfig(tierConfig))
      return res.status(400).json({ error: 'tier_config_json is invalid' });

    try {
      const created = await createBadgeSet({
        name,
        shape,
        symbol,
        icon_path: iconPath || null,
        main_text: mainText,
        secondary_text: secondaryText,
        preview_svg: previewSvg,
        tier_config_json: tierConfig,
        created_by_user_id: req.user?.userId ?? null,
      });
      res.status(201).json(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '23505') return res.status(409).json({ error: 'Badge set name must be unique' });
      console.error('Error creating badge set:', err);
      res.status(500).json({ error: 'Failed to create badge set' });
    }
  },
);

router.put(
  '/badge-sets/:id',
  authRequired,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid badge set id' });
    }

    const patch: {
      name?: string;
      shape?: BadgeShape;
      symbol?: string;
      icon_path?: string | null;
      main_text?: string;
      secondary_text?: string;
      preview_svg?: string;
      tier_config_json?: BadgeTierConfig;
    } = {};

    if (req.body?.name !== undefined) {
      if (typeof req.body.name !== 'string' || !req.body.name.trim()) {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      patch.name = req.body.name.trim();
    }
    if (req.body?.shape !== undefined) {
      const shape = normalizeShape(req.body.shape);
      if (!shape) return res.status(400).json({ error: 'shape is invalid' });
      patch.shape = shape;
    }
    if (req.body?.symbol !== undefined) {
      if (typeof req.body.symbol !== 'string' || !req.body.symbol.trim()) {
        return res.status(400).json({ error: 'symbol must be a non-empty string' });
      }
      patch.symbol = req.body.symbol.trim();
    }
    if (req.body?.icon_path !== undefined) {
      patch.icon_path = typeof req.body.icon_path === 'string' ? req.body.icon_path : null;
    }
    if (req.body?.main_text !== undefined) {
      if (typeof req.body.main_text !== 'string' || !req.body.main_text.trim()) {
        return res.status(400).json({ error: 'main_text must be a non-empty string' });
      }
      patch.main_text = req.body.main_text;
    }
    if (req.body?.secondary_text !== undefined) {
      if (typeof req.body.secondary_text !== 'string' || !req.body.secondary_text.trim()) {
        return res.status(400).json({ error: 'secondary_text must be a non-empty string' });
      }
      patch.secondary_text = req.body.secondary_text;
    }
    if (req.body?.preview_svg !== undefined) {
      if (typeof req.body.preview_svg !== 'string' || !req.body.preview_svg.trim()) {
        return res.status(400).json({ error: 'preview_svg must be a non-empty string' });
      }
      patch.preview_svg = req.body.preview_svg;
    }
    if (req.body?.tier_config_json !== undefined) {
      if (!isValidTierConfig(req.body.tier_config_json)) {
        return res.status(400).json({ error: 'tier_config_json is invalid' });
      }
      patch.tier_config_json = req.body.tier_config_json;
    }

    try {
      const updated = await updateBadgeSetById(id, patch);
      if (!updated) return res.status(404).json({ error: 'Badge set not found' });
      res.json(updated);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '23505') return res.status(409).json({ error: 'Badge set name must be unique' });
      console.error('Error updating badge set:', err);
      res.status(500).json({ error: 'Failed to update badge set' });
    }
  },
);

router.delete(
  '/badge-sets/:id',
  authRequired,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid badge set id' });
    }

    try {
      const linked = await pool.query<{ published: boolean }>(
        `
      SELECT e.published
      FROM event_badge_set_links l
      JOIN events e ON e.id = l.event_id
      WHERE l.badge_set_id = $1
      `,
        [id],
      );
      if (linked.rows.some((row) => row.published)) {
        return res
          .status(409)
          .json({ error: 'Cannot delete: badge set is attached to a published event' });
      }
      if ((linked.rowCount ?? 0) > 0) {
        await pool.query(`DELETE FROM event_badge_set_links WHERE badge_set_id = $1`, [id]);
      }

      const deleted = await deleteBadgeSetById(id);
      if (!deleted) return res.status(404).json({ error: 'Badge set not found' });
      res.status(204).end();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') {
        return res.status(409).json({ error: 'Badge set is attached to one or more events' });
      }
      console.error('Error deleting badge set:', err);
      res.status(500).json({ error: 'Failed to delete badge set' });
    }
  },
);

export default router;
