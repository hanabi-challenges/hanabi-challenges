import { Router, Response } from 'express';
import {
  authOptional,
  authRequired,
  AuthenticatedRequest,
  requireSiteAdmin,
} from '../../middleware/authMiddleware';
import {
  getSiteContentPage,
  listSiteContentPages,
  upsertSiteContentPage,
} from './site-content.service';

const router = Router();

router.get(
  '/content/pages',
  authRequired,
  requireSiteAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const pages = await listSiteContentPages();
      res.json({ pages });
    } catch (err) {
      console.error('Error listing content pages', err);
      res.status(500).json({ error: 'Failed to list content pages' });
    }
  },
);

router.get(
  '/content/pages/:slug',
  authOptional,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const page = await getSiteContentPage(String(req.params.slug));
      if (!page) {
        return res.status(404).json({ error: 'Content page not found' });
      }
      res.json(page);
    } catch (err) {
      console.error('Error loading content page', err);
      res.status(500).json({ error: 'Failed to load content page' });
    }
  },
);

router.put(
  '/content/pages/:slug',
  authRequired,
  requireSiteAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const title = typeof req.body?.title === 'string' ? req.body.title : '';
    const markdown = typeof req.body?.markdown === 'string' ? req.body.markdown : '';

    if (!title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    if (!markdown.trim()) {
      return res.status(400).json({ error: 'markdown is required' });
    }

    try {
      const page = await upsertSiteContentPage(
        String(req.params.slug),
        { title, markdown },
        req.user!.userId,
      );
      res.json(page);
    } catch (err) {
      console.error('Error updating content page', err);
      res.status(500).json({ error: 'Failed to update content page' });
    }
  },
);

export default router;
