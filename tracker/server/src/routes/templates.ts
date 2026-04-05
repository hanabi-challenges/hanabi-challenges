import { Router, type Request, type Response, type NextFunction } from 'express';
import { getPool } from '../db/pool.js';
import {
  requireTrackerAuth,
  requirePermission,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

interface TemplateRow {
  slug: string;
  name: string;
  template_body: string | null;
  template_updated_at: string | null;
  updated_by_display_name: string | null;
}

/** GET /tracker/api/templates/:type_slug — return description template for a ticket type */
router.get(
  '/:type_slug',
  requireTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { type_slug } = req.params as { type_slug: string };
    try {
      const sql = getPool();
      const [row] = await sql<TemplateRow[]>`
        SELECT
          tt.slug,
          tt.name,
          tt.template_body,
          tt.template_updated_at,
          u.display_name AS updated_by_display_name
        FROM ticket_types tt
        LEFT JOIN public.users u ON u.id = tt.template_updated_by
        WHERE tt.slug = ${type_slug}
      `;

      if (!row) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Template not found.',
            correlationId: (req as AuthenticatedRequest).correlationId,
          },
        });
        return;
      }

      const etag = row.template_updated_at
        ? `"${Buffer.from(row.template_updated_at).toString('base64')}"`
        : '"default"';
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({
        type_slug: row.slug,
        type_name: row.name,
        body: row.template_body ?? '',
        updated_at: row.template_updated_at,
        updated_by: row.updated_by_display_name,
      });
    } catch (err) {
      next(err);
    }
  },
);

/** PUT /tracker/api/templates/:type_slug — update description template (committee only) */
router.put(
  '/:type_slug',
  requireTrackerAuth,
  requirePermission('ticket.decide'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { type_slug } = req.params as { type_slug: string };
    const { body } = req.body as { body?: string };

    if (typeof body !== 'string') {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'body is required and must be a string.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    if (body.length > 5000) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Template body must be 5000 characters or fewer.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    try {
      const sql = getPool();
      const actorId = (req as AuthenticatedRequest).trackerUser.id;

      const [updated] = await sql<{ slug: string }[]>`
        UPDATE ticket_types
        SET
          template_body       = ${body},
          template_updated_at = now(),
          template_updated_by = ${actorId}
        WHERE slug = ${type_slug}
        RETURNING slug
      `;

      if (!updated) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Template not found.',
            correlationId: (req as AuthenticatedRequest).correlationId,
          },
        });
        return;
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

/** GET /tracker/api/templates — list all templates (committee only) */
router.get(
  '/',
  requireTrackerAuth,
  requirePermission('ticket.decide'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sql = getPool();
      const rows = await sql<TemplateRow[]>`
        SELECT
          tt.slug,
          tt.name,
          tt.template_body,
          tt.template_updated_at,
          u.display_name AS updated_by_display_name
        FROM ticket_types tt
        LEFT JOIN public.users u ON u.id = tt.template_updated_by
        ORDER BY tt.sort_order
      `;
      res.json({
        templates: rows.map((r) => ({
          type_slug: r.slug,
          type_name: r.name,
          body: r.template_body ?? '',
          updated_at: r.template_updated_at,
          updated_by: r.updated_by_display_name,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as templatesRouter };
