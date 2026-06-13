import * as repository from './import.repository.js';
import { persistImport } from './persistence.service.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

/**
 * Handles confirmation of import job by applying selected mapping and strategy.
 */
export async function confirmImport(workspaceId, jobId, userId, { mappings, resolutionStrategy, overrides }) {
  if (!mappings || typeof mappings !== 'object') {
    throw new ValidationError('Mappings object is required.');
  }
  if (!resolutionStrategy || !['KEEP_EXISTING', 'UPDATE_EXISTING', 'SKIP'].includes(resolutionStrategy)) {
    throw new ValidationError('A valid global resolutionStrategy (KEEP_EXISTING, UPDATE_EXISTING, SKIP) is required.');
  }

  const job = await repository.findById(jobId);
  if (!job || job.workspaceId !== workspaceId) {
    throw new NotFoundError('Import job not found.');
  }

  if (job.status !== 'PREVIEW_READY') {
    throw new ValidationError(`Job status must be PREVIEW_READY to confirm. Current status: ${job.status}`);
  }

  return persistImport(workspaceId, jobId, userId, { mappings, resolutionStrategy, overrides });
}
