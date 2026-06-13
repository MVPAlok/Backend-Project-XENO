import * as service from './import.service.js';
import { buildImportSummary } from './utils/importSummary.js';

/**
 * Handle POST /workspaces/:workspaceId/imports/customers
 */
export async function importCustomers(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    const file = req.file;

    const job = await service.importCustomers(workspaceId, userId, file);

    return res.status(200).json(buildImportSummary(job));
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle POST /workspaces/:workspaceId/imports/orders
 */
export async function importOrders(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    const file = req.file;

    const job = await service.importOrders(workspaceId, userId, file);

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

    const history = jobs.map(job => ({
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt,
      totalRows: job.totalRows,
      successfulRows: job.successfulRows,
      failedRows: job.failedRows,
      completedAt: job.completedAt
    }));

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

    return res.status(200).json(job);
  } catch (error) {
    return next(error);
  }
}
