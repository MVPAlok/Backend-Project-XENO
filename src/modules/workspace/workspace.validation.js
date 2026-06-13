import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string({
      required_error: 'Workspace name is required',
      invalid_type_error: 'Workspace name must be a string'
    })
      .min(3, 'Workspace name must be at least 3 characters long')
      .max(100, 'Workspace name must not exceed 100 characters')
      .trim(),
    description: z.string({
      invalid_type_error: 'Description must be a string'
    })
      .max(500, 'Description must not exceed 500 characters')
      .optional()
      .nullable()
  })
});

export const workspaceIdParamSchema = z.object({
  params: z.object({
    workspaceId: z.string().uuid('Invalid workspace ID format. Must be a valid UUID.')
  })
});
