import * as service from './import.service.js';
import { buildImportSummary } from './utils/importSummary.js';

/**
 * Handle POST /workspaces/:workspaceId/imports/preview
 */
export async function generatePreview(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    const file = req.file;

    const preview = await service.generateImportPreview(workspaceId, userId, file);

    return res.status(200).json(preview);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle POST /workspaces/:workspaceId/imports/confirm
 */
export async function confirmImport(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    const { importJobId, mappings, resolutionStrategy, overrides = [], fixedRows, skippedRows } = req.body;

    const job = await service.confirmImport(workspaceId, importJobId, userId, {
      mappings,
      resolutionStrategy,
      overrides,
      fixedRows,
      skippedRows
    });

    return res.status(200).json(buildImportSummary(job));
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle GET /workspaces/:workspaceId/imports
 */
export async function getImportHistory(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const jobs = await service.getWorkspaceImports(workspaceId);

    const history = jobs.map(job => buildImportSummary(job));

    return res.status(200).json(history);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle GET /workspaces/:workspaceId/imports/:importId
 */
export async function getImportDetails(req, res, next) {
  try {
    const { workspaceId, importId } = req.params;
    const job = await service.getImportDetails(workspaceId, importId);

    return res.status(200).json(buildImportSummary(job));
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle DELETE /workspaces/:workspaceId/imports/:importId
 */
export async function deleteImportJob(req, res, next) {
  try {
    const { workspaceId, importId } = req.params;
    await service.deleteImportJob(workspaceId, importId);

    return res.status(200).json({ success: true, message: 'Import job deleted successfully.' });
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle DELETE /workspaces/:workspaceId/imports
 */
export async function clearImportHistory(req, res, next) {
  try {
    const { workspaceId } = req.params;
    await service.clearImportHistory(workspaceId);

    return res.status(200).json({ success: true, message: 'Import history cleared successfully.' });
  } catch (error) {
    return next(error);
  }
}
