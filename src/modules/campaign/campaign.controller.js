import * as service from './campaign.service.js';

/**
 * Handle POST /workspaces/:workspaceId/campaigns
 */
export async function createCampaign(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const campaign = await service.createCampaign(workspaceId, req.body);
    return res.status(201).json(campaign);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle GET /workspaces/:workspaceId/campaigns
 */
export async function listCampaigns(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const campaigns = await service.listCampaigns(workspaceId);
    return res.status(200).json(campaigns);
  } catch (error) {
    return next(error);
  }
}
