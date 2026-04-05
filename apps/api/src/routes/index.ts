import { Router } from 'express';
import authRouter from '../modules/auth/auth.routes';
import discordRouter from '../modules/auth/discord.routes';
import botRouter from '../modules/bot/bot.routes';
import eventsRouter from '../modules/events/events.routes';
import registrationsRouter from '../modules/registrations/registrations.routes';
import resultsRouter from '../modules/results/results.routes';
import leaderboardsRouter from '../modules/leaderboards/leaderboards.routes';
import awardsRouter from '../modules/awards/awards.routes';
import ratingsRouter from '../modules/ratings/ratings.routes';
import variantsRouter from '../modules/variants/variants.routes';
import siteContentRouter from '../modules/site-content/site-content.routes';
import badgesRouter from '../modules/badges/badges.routes';
import notificationsRouter from '../modules/notifications/notifications.routes';
import adminAccessRouter from '../modules/admin-access/admin-access.routes';

const router = Router();

router.use('/api', authRouter);
router.use('/api/auth', discordRouter);
router.use('/api/events', eventsRouter);
router.use('/api', registrationsRouter);
router.use('/api/results', resultsRouter);
router.use('/api', leaderboardsRouter);
router.use('/api', awardsRouter);
router.use('/api', ratingsRouter);
router.use('/api', variantsRouter);
router.use('/api', siteContentRouter);
router.use('/api', badgesRouter);
router.use('/api', notificationsRouter);
router.use('/api', adminAccessRouter);
router.use('/api/bot', botRouter);

export default router;
