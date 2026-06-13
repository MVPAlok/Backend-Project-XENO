import { z } from 'zod';

export const workspaceIdParamSchema = z.object({
  params: z.object({
    workspaceId: z.string().uuid('Invalid workspace ID format. Must be a valid UUID.')
  })
});

export const importDetailParamSchema = z.object({
  params: z.object({
    workspaceId: z.string().uuid('Invalid workspace ID format. Must be a valid UUID.'),
    importId: z.string().uuid('Invalid import ID format. Must be a valid UUID.')
  })
});

export const confirmImportBodySchema = z.object({
  body: z.object({
    importJobId: z.string().uuid('Invalid import job ID format. Must be a valid UUID.'),
    mappings: z.record(z.string(), z.string()),
    resolutionStrategy: z.enum(['KEEP_EXISTING', 'UPDATE_EXISTING', 'SKIP']),
    overrides: z.array(
      z.object({
        identifier: z.string(),
        strategy: z.enum(['KEEP_EXISTING', 'UPDATE_EXISTING', 'SKIP'])
      })
    ).optional()
  })
});

