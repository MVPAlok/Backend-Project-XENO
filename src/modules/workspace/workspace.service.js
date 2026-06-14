import * as repository from './workspace.repository.js';
import { generateUniqueSlug } from '../../shared/utils/slug.js';
import { NotFoundError, AuthorizationError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

/**
 * Creates a new workspace and registers the creator as OWNER.
 */
export async function createWorkspace(userId, { name, description }) {
  // Uniqueness check for slug generation
  const checkSlugExists = async (slug) => {
    const existing = await repository.findBySlug(slug);
    return !!existing;
  };

  const slug = await generateUniqueSlug(name, checkSlugExists);

  const workspace = await repository.createWorkspace({
    name,
    slug,
    description,
    userId
  });

  logger.info({
    userId,
    workspaceId: workspace.id
  }, `Workspace Created`);

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    role: 'OWNER'
  };
}

/**
 * Lists all workspaces the user has access to.
 */
export async function listWorkspaces(userId) {
  const memberships = await repository.listUserWorkspaces(userId);

  return memberships.map(m => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role,
    createdAt: m.workspace.createdAt
  }));
}

/**
 * Retrieves a workspace's details.
 * Performs authorization checks to ensure the user belongs to the workspace.
 */
export async function getWorkspace(workspaceId, userId) {
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

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt
  };
}

/**
 * Deletes a workspace if the user is the OWNER.
 */
export async function deleteWorkspace(workspaceId, userId) {
  const membership = await repository.findMembership(workspaceId, userId);
  if (!membership || membership.role !== 'OWNER') {
    logger.warn({ userId, workspaceId }, 'Unauthorized workspace deletion attempt');
    throw new AuthorizationError('Only the workspace owner can delete the workspace');
  }

  await repository.deleteWorkspace(workspaceId);

  logger.info({
    userId,
    workspaceId
  }, `Workspace Deleted`);
}
