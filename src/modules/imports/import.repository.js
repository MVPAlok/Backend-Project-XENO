import prisma from '../../config/database.js';

/**
 * Creates a new tracking job record in PENDING state.
 */
export async function createJob({ workspaceId, uploadedBy, type, fileName }) {
  return prisma.importJob.create({
    data: {
      workspaceId,
      uploadedBy,
      type,
      fileName,
      status: 'PENDING',
      totalRows: 0,
      processedRows: 0,
      successfulRows: 0,
      failedRows: 0
    }
  });
}

/**
 * Updates the state and metrics of an import job.
 */
export async function updateJob(id, data) {
  return prisma.importJob.update({
    where: { id },
    data
  });
}

/**
 * Finds a specific job by ID.
 */
export async function findById(id) {
  return prisma.importJob.findUnique({
    where: { id }
  });
}

/**
 * List jobs for a workspace.
 */
export async function listJobs(workspaceId) {
  return prisma.importJob.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Deletes a specific job.
 */
export async function deleteJob(id) {
  return prisma.importJob.delete({
    where: { id }
  });
}

/**
 * Deletes all jobs for a workspace.
 */
export async function deleteJobsByWorkspace(workspaceId) {
  return prisma.importJob.deleteMany({
    where: { workspaceId }
  });
}
