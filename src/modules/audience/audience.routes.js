import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireWorkspaceMember } from '../workspace/workspace.middleware.js';
import { validate } from '../../middlewares/validation.middleware.js';
import { audienceGenLimiter } from '../../middlewares/rate-limit.middleware.js';
import { generateAudienceSchema, saveSegmentSchema, segmentIdParamSchema } from './audience.validation.js';
import * as controller from './audience.controller.js';

// Use mergeParams so we can access workspaceId from parent router mounting
const router = Router({ mergeParams: true });

// All segment and audience routes require authentication & workspace membership
router.use(requireAuth);
router.use(requireWorkspaceMember);

// POST /workspaces/:workspaceId/audiences/generate
router.post(
  '/audiences/generate',
  audienceGenLimiter,
  validate(generateAudienceSchema),
  controller.generateAudience
);

// POST /workspaces/:workspaceId/segments
router.post(
  '/segments',
  validate(saveSegmentSchema),
  controller.createSegment
);

// GET /workspaces/:workspaceId/segments
router.get(
  '/segments',
  controller.listSegments
);

// GET /workspaces/:workspaceId/segments/:segmentId
router.get(
  '/segments/:segmentId',
  validate(segmentIdParamSchema),
  controller.getSegmentDetails
);

// GET /workspaces/:workspaceId/segments/:segmentId/preview
router.get(
  '/segments/:segmentId/preview',
  validate(segmentIdParamSchema),
  controller.getSegmentPreview
);

export default router;
