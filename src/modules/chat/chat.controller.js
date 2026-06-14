import * as service from './chat.service.js';

/**
 * GET /workspaces/:workspaceId/chats
 * Retrieves or starts the chat conversation.
 */
export async function getConversation(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;

    const conversation = await service.getOrCreateConversation(workspaceId, userId);
    return res.status(200).json(conversation);
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /workspaces/:workspaceId/chats/messages
 * Sends a message and receives AI reply.
 */
export async function postMessage(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const reply = await service.postChatMessage(workspaceId, userId, text);
    return res.status(201).json(reply);
  } catch (error) {
    return next(error);
  }
}
