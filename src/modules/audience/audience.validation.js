import { z } from 'zod';

export const ruleSchema = z.object({
  field: z.enum([
    'totalSpend',
    'lastPurchaseDays',
    'purchaseFrequency',
    'city',
    'category',
    'orderCount',
    'averageOrderValue',
    'firstPurchaseDays',
    'discountUsage'
  ]),
  operator: z.enum(['>', '<', '>=', '<=', '=', 'IN']),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number()]))
  ])
});

export const llmOutputSchema = z.object({
  intent: z.literal('SEGMENT'),
  segmentName: z.string().min(1).max(100),
  rules: z.array(ruleSchema),
  explanation: z.string().optional()
});

export const generateAudienceSchema = z.object({
  body: z.object({
    prompt: z.string({
      required_error: 'Prompt is required.',
      invalid_type_error: 'Prompt must be a string.'
    }).min(1, 'Prompt must not be empty.').max(500, 'Prompt must not exceed 500 characters.')
  })
});

export const saveSegmentSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Segment name is required.' }).min(1).max(100),
    description: z.string().max(500).optional().nullable(),
    rules: z.array(ruleSchema, { required_error: 'Segment rules are required.' }).min(1, 'Segment must have at least one rule.')
  })
});

export const segmentIdParamSchema = z.object({
  params: z.object({
    workspaceId: z.string().uuid('Invalid workspace ID format.'),
    segmentId: z.string().uuid('Invalid segment ID format.')
  })
});
