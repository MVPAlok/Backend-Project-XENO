import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validation.middleware.js';
import { createWorkspaceSchema, workspaceIdParamSchema } from './workspace.validation.js';
import { requireWorkspaceMember } from './workspace.middleware.js';
import * as controller from './workspace.controller.js';

const router = Router();

// All workspace routes require authentication
router.use(requireAuth);

// Create workspace
router.post(
  '/',
  validate(createWorkspaceSchema),
  controller.createWorkspace
);

// List user's workspaces
router.get(
  '/',
  controller.listWorkspaces
);

// Retrieve details for a specific workspace
router.get(
  '/:workspaceId',
  validate(workspaceIdParamSchema),
  requireWorkspaceMember,
  controller.getWorkspace
);

export default router;
