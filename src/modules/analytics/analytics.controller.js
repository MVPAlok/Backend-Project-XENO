import * as service from './analytics.service.js';

/**
 * GET /workspaces/:workspaceId/analytics/funnel
 */
export async function getCampaignFunnel(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const funnel = await service.getCampaignFunnel(workspaceId);
    return res.status(200).json(funnel);
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /workspaces/:workspaceId/analytics/channels
 */
export async function getChannelPerformance(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const performance = await service.getChannelPerformance(workspaceId);
    return res.status(200).json(performance);
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /workspaces/:workspaceId/analytics/insights
 */
export async function getWorkspaceInsights(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const insights = await service.getWorkspaceInsights(workspaceId);
    return res.status(200).json(insights);
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /workspaces/:workspaceId/analytics/dashboard
 */
export async function getDashboardMetrics(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const data = await service.getDashboardMetrics(workspaceId);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

