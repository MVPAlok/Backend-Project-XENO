import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validation.middleware.js';
import { createWorkspaceSchema, workspaceIdParamSchema } from './workspace.validation.js';
import { requireWorkspaceMember } from './workspace.middleware.js';
import * as controller from './workspace.controller.js';

import importRoutes from '../imports/import.routes.js';
import audienceRoutes from '../audience/audience.routes.js';

const router = Router();

// All workspace routes require authentication
router.use(requireAuth);

// Nest import routes
router.use('/:workspaceId/imports', validate(workspaceIdParamSchema), requireWorkspaceMember, importRoutes);

// Nest audience and segment routes
router.use('/:workspaceId', validate(workspaceIdParamSchema), audienceRoutes);

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
