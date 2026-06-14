import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireWorkspaceMember } from '../workspace/workspace.middleware.js';
import * as controller from './analytics.controller.js';

const router = Router({ mergeParams: true });

// Require authentication and workspace member validation for all analytics endpoints
router.use(requireAuth);
router.use(requireWorkspaceMember);

// GET /workspaces/:workspaceId/analytics/funnel - Global campaign funnel performance
router.get('/funnel', controller.getCampaignFunnel);

// GET /workspaces/:workspaceId/analytics/channels - Channel performance benchmarks
router.get('/channels', controller.getChannelPerformance);

// GET /workspaces/:workspaceId/analytics/insights - Actionable AI CRM insights
router.get('/insights', controller.getWorkspaceInsights);

// GET /workspaces/:workspaceId/analytics/dashboard - Real-time GMV, customer metrics, and activities
router.get('/dashboard', controller.getDashboardMetrics);

export default router;
