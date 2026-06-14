import { z } from 'zod';

export const createCampaignSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Campaign name is required.' }).min(1).max(100),
    segmentId: z.string({ required_error: 'Segment ID is required.' }).uuid('Invalid segment ID format.'),
    channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP'], { required_error: 'Messaging channel is required.' }),
    messageSubject: z.string().max(200).optional().nullable(),
    messageBody: z.string({ required_error: 'Message body content is required.' }).min(1, 'Message body must not be empty.'),
    status: z.enum(['DRAFT', 'SENT', 'SCHEDULED']).default('DRAFT')
  })
});

export const campaignIdParamSchema = z.object({
  params: z.object({
    workspaceId: z.string().uuid('Invalid workspace ID format.'),
    campaignId: z.string().uuid('Invalid campaign ID format.').optional()
  })
});
