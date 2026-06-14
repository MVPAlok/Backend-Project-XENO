/**
 * Builder utility for generating the preview JSON payload.
 */
export function buildPreview({
  importJobId,
  totalRows,
  validRowsCount,
  invalidRowsCount,
  potentialCustomersCount,
  potentialOrdersCount,
  potentialDuplicatesCount,
  suggestedMappings,
  suggestedStrategy,
  strategyExplanation,
  sampleTransformedRecords,
  invalidRows,
  conflicts
}) {
  return {
    importJobId,
    summary: {
      totalRows,
      validRows: validRowsCount,
      invalidRows: invalidRowsCount,
      potentialCustomers: potentialCustomersCount,
      potentialOrders: potentialOrdersCount,
      potentialDuplicates: potentialDuplicatesCount
    },
    detectedMappings: suggestedMappings,
    conflicts,
    suggestedStrategy,
    strategyExplanation,
    sampleTransformedRecords,
    invalidRows
  };
}
