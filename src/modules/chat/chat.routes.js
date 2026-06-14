import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireWorkspaceMember } from '../workspace/workspace.middleware.js';
import * as controller from './chat.controller.js';

const router = Router({ mergeParams: true });

// Require authentication and workspace membership for all chatbot endpoints
router.use(requireAuth);
router.use(requireWorkspaceMember);

// GET /workspaces/:workspaceId/chats - Get/start persistent AI chatbot conversation
router.get('/', controller.getConversation);

// POST /workspaces/:workspaceId/chats/messages - Post user message & trigger Gemini evaluation
router.post('/messages', controller.postMessage);

export default router;
