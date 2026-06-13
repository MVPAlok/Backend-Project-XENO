import * as service from './audience.service.js';

export async function generateAudience(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const { prompt } = req.body;
    
    const result = await service.generateAudience(workspaceId, prompt);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function createSegment(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const { name, description, rules } = req.body;
    const userId = req.user.id;

    const segment = await service.saveSegment(workspaceId, userId, name, description, rules);
    return res.status(201).json(segment);
  } catch (err) {
    next(err);
  }
}

export async function listSegments(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const segments = await service.listSegments(workspaceId);
    return res.status(200).json(segments);
  } catch (err) {
    next(err);
  }
}

export async function getSegmentDetails(req, res, next) {
  try {
    const { workspaceId, segmentId } = req.params;
    const segment = await service.getSegmentDetails(workspaceId, segmentId);
    return res.status(200).json(segment);
  } catch (err) {
    next(err);
  }
}

export async function getSegmentPreview(req, res, next) {
  try {
    const { workspaceId, segmentId } = req.params;
    const preview = await service.getSegmentPreview(workspaceId, segmentId);
    return res.status(200).json(preview);
  } catch (err) {
    next(err);
  }
}
