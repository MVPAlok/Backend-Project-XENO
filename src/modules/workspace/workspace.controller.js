import * as service from './workspace.service.js';

/**
 * Handle POST /workspaces
 */
export async function createWorkspace(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, description } = req.body;

    const workspace = await service.createWorkspace(userId, { name, description });

    return res.status(201).json(workspace);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle GET /workspaces
 */
export async function listWorkspaces(req, res, next) {
  try {
    const userId = req.user.id;
    const workspaces = await service.listWorkspaces(userId);

    return res.status(200).json(workspaces);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle GET /workspaces/:workspaceId
 */
export async function getWorkspace(req, res, next) {
  try {
    const userId = req.user.id;
    const { workspaceId } = req.params;

    const workspace = await service.getWorkspace(workspaceId, userId);

    return res.status(200).json(workspace);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle DELETE /workspaces/:workspaceId
 */
export async function deleteWorkspace(req, res, next) {
  try {
    const userId = req.user.id;
    const { workspaceId } = req.params;

    await service.deleteWorkspace(workspaceId, userId);

    return res.status(200).json({ message: 'Workspace deleted successfully' });
  } catch (error) {
    return next(error);
  }
}
