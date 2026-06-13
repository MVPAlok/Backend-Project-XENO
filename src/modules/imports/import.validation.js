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
