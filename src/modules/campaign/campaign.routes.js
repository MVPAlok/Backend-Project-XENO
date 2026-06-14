import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireWorkspaceMember } from '../workspace/workspace.middleware.js';
import { validate } from '../../middlewares/validation.middleware.js';
import { createCampaignSchema } from './campaign.validation.js';
import * as controller from './campaign.controller.js';

const router = Router({ mergeParams: true });

// Ensure all campaign routes require auth and workspace access
router.use(requireAuth);
router.use(requireWorkspaceMember);

// POST /workspaces/:workspaceId/campaigns - Create a new campaign
router.post(
  '/',
  validate(createCampaignSchema),
  controller.createCampaign
);

// GET /workspaces/:workspaceId/campaigns - List all campaigns in the workspace
router.get(
  '/',
  controller.listCampaigns
);

export default router;
