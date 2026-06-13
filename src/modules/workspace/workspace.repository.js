import prisma from '../../config/database.js';

/**
 * Create a new workspace and automatically set the creator as OWNER within a transaction.
 */
export async function createWorkspace({ name, slug, description, userId }) {
  return prisma.workspace.create({
    data: {
      name,
      slug,
      description,
      memberships: {
        create: {
          userId,
          role: 'OWNER'
        }
      }
    },
    include: {
      memberships: true
    }
  });
}

/**
 * Find workspace by slug.
 */
export async function findBySlug(slug) {
  return prisma.workspace.findUnique({
    where: { slug }
  });
}

/**
 * Find workspace by ID.
 */
export async function findById(id) {
  return prisma.workspace.findUnique({
    where: { id }
  });
}

/**
 * Find membership for a specific user in a specific workspace.
 */
export async function findMembership(workspaceId, userId) {
  return prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId
      }
    }
  });
}

/**
 * List all memberships for a user, including workspace details.
 */
export async function listUserWorkspaces(userId) {
  return prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: true
    },
    orderBy: {
      joinedAt: 'desc'
    }
  });
}
