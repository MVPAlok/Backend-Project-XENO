import * as repository from './import.repository.js';
import { NotFoundError } from '../../utils/errors.js';

export { generateImportPreview } from './preview.service.js';
export { confirmImport } from './confirmation.service.js';

/**
 * Get import job history.
 */
export async function getWorkspaceImports(workspaceId) {
  return repository.listJobs(workspaceId);
}

/**
 * Get single import job details.
 */
export async function getImportDetails(workspaceId, importId) {
  const job = await repository.findById(importId);
  if (!job || job.workspaceId !== workspaceId) {
    throw new NotFoundError('Import job not found.');
  }
  return job;
}
