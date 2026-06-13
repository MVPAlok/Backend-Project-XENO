import * as repository from './workspace.repository.js';
import { NotFoundError, AuthorizationError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

/**
 * Middleware to verify if the authenticated user belongs to the requested workspace.
 * Resolves 404 if workspace doesn't exist, 403 if user is not a member.
 */
export async function requireWorkspaceMember(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AuthorizationError('Authentication required');
    }

    const workspace = await repository.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const membership = await repository.findMembership(workspaceId, userId);
    if (!membership) {
      logger.warn({
        userId,
        workspaceId
      }, `Workspace Access Denied`);
      throw new AuthorizationError('Access denied to this workspace');
    }

    // Attach membership to request context
    req.membership = membership;
    return next();
  } catch (error) {
    return next(error);
  }
}
