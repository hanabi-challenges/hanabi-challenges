import { Router, Request, Response } from 'express';
import { getUserIdByDisplayName, listUserBadges, listUserAwards } from './user.service';

const router = Router();

// GET /api/users/:username/badges
router.get('/:username/badges', async (req: Request, res: Response) => {
  const username = String(req.params.username);

  if (!username) {
    res.status(400).json({ error: 'Username is required' });
    return;
  }

  try {
    const userId = await getUserIdByDisplayName(username);
    if (!userId) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const badges = await listUserBadges(userId);
    res.json(badges);
  } catch (err) {
    console.error('Error fetching user badges:', err);
    res.status(500).json({ error: 'Failed to fetch user badges' });
  }
});

// GET /api/users/:username/awards
router.get('/:username/awards', async (req: Request, res: Response) => {
  const username = String(req.params.username);

  if (!username) {
    res.status(400).json({ error: 'Username is required' });
    return;
  }

  try {
    const userId = await getUserIdByDisplayName(username);
    if (!userId) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const awards = await listUserAwards(userId);
    res.json(awards);
  } catch (err) {
    console.error('Error fetching user awards:', err);
    res.status(500).json({ error: 'Failed to fetch user awards' });
  }
});

export default router;
