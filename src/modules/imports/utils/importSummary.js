/**
 * Formats an ImportJob database object into a clean, response-friendly summary object.
 */
export function buildImportSummary(job) {
  if (!job) return null;
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    type: job.type,
    fileName: job.fileName,
    status: job.status,
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    successfulRows: job.successfulRows,
    failedRows: job.failedRows,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    previewData: job.previewData,
    detectedMappings: job.detectedMappings,
    conflictSummary: job.conflictSummary,
    resolutionStrategy: job.resolutionStrategy,
    confirmedAt: job.confirmedAt,
    confirmedBy: job.confirmedBy
  };
}
export default buildImportSummary;
