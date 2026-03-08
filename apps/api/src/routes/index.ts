import { Router } from 'express';
import authRouter from '../modules/auth/auth.routes';
import eventRouter from '../modules/events/event.routes';
import teamRouter from '../modules/teams/team.routes';
import resultRouter from '../modules/results/result.routes';
import userRouter from '../modules/users/user.routes';
import sessionLadderRouter from '../modules/session-ladder/session-ladder.routes';
import variantsRouter from '../modules/variants/variants.routes';
import siteContentRouter from '../modules/site-content/site-content.routes';
import badgesRouter from '../modules/badges/badges.routes';
import notificationsRouter from '../modules/notifications/notifications.routes';
import adminAccessRouter from '../modules/admin-access/admin-access.routes';
import simRouter from '../modules/sim/sim.routes';

const router = Router();

router.use('/api', authRouter); // /api/login, /api/me
router.use('/api/events', eventRouter); // /api/events/...
router.use('/api/event-teams', teamRouter); // /api/event-teams/...
router.use('/api/results', resultRouter);
router.use('/api/users', userRouter);
router.use('/api/session-ladder', sessionLadderRouter);
router.use('/api', variantsRouter);
router.use('/api', siteContentRouter);
router.use('/api', badgesRouter);
router.use('/api', notificationsRouter);
router.use('/api', adminAccessRouter);
router.use('/api/sim', simRouter); // /api/sim/...

export default router;
