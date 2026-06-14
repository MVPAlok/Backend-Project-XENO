import prisma from '../../config/database.js';
import { compileRulesToSql } from '../../shared/query-builder/queryBuilder.js';
import { generateSummary } from '../../brain/summary-generator/index.js';
import logger from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';

/**
 * Gets the active chat conversation for a workspace and user, creating it if it doesn't exist.
 */
export async function getOrCreateConversation(workspaceId, userId) {
  let conversation = await prisma.chatConversation.findFirst({
    where: { workspaceId, userId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!conversation) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const name = user ? user.firstName : 'there';
    
    conversation = await prisma.chatConversation.create({
      data: {
        workspaceId,
        userId,
        title: 'Audience AI Copilot'
      }
    });

    // Seed initial welcome message
    const welcomeText = `Hello ${name}! I am your AI Shopper Engagement Copilot. I can help you compile demographic or purchase filters, query shopper records, and formulate campaigns. Type a query like 'bring back my loyal customers' or 'find buyers from Mumbai who spent over 4000'.`;
    
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        sender: 'AI',
        text: welcomeText
      }
    });

    // Re-fetch conversation with the seeded welcome message
    conversation = await prisma.chatConversation.findUnique({
      where: { id: conversation.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }

  return conversation;
}

/**
 * Sends a message, processes it with Gemini LLM, queries the DB if segmenting, and saves logs.
 */
export async function postChatMessage(workspaceId, userId, messageText) {
  // 1. Get user details
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ValidationError('User not found.');

  // 2. Fetch or create conversation
  const conversation = await prisma.chatConversation.findFirst({
    where: { workspaceId, userId }
  });
  if (!conversation) throw new ValidationError('Conversation not found.');

  // 3. Save user message
  const userMessage = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      sender: 'USER',
      text: messageText
    }
  });

  // 4. Retrieve chat history (up to last 15 messages)
  const historyMessages = await prisma.chatMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    take: 15
  });
  
  // Sort ascending for LLM feed
  const sortedHistory = historyMessages.reverse();

  // 5. Invoke Gemini API
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'gemini-2.5-flash';

  const systemInstruction = `You are the AI Audience Intelligence chatbot for XENO CRM.
The user is logged in as ${user.firstName} ${user.lastName}. Address them by their first name "${user.firstName}" when greeting or responding conversationally to personalize the chat.

You have two modes of response:
1. CHAT: If the user is greeting you, asking general questions, or discussing marketing strategies/questions, respond conversationally as a friendly CRM copilot.
   Format your response strictly as a JSON object:
   {
     "intent": "CHAT",
     "reply": "Your friendly, conversational response here"
   }

2. SEGMENT: If the user is asking to filter, search, query, or build a segment of customers (e.g., "find buyers in Mumbai", "loyal customers", "inactive shoppers"), respond with segment rules.
   Format your response strictly as a JSON object:
   {
     "intent": "SEGMENT",
     "segmentName": "A concise descriptive title for this customer segment",
     "rules": [
       {
         "field": "field name",
         "operator": "comparison operator",
         "value": "JSON stringified value (number, boolean, string, or array of strings/numbers)"
       }
     ],
     "explanation": "A short summary explaining who this audience segment targets."
   }

Fields supported for SEGMENT rules:
- "totalSpend" (numeric: customer's total spent amount across all orders)
- "lastPurchaseDays" (numeric: days since customer's last purchase date)
- "averageOrderValue" (numeric: customer's average spent per order)
- "city" (string: customer's location city)
- "category" (string: product category purchased by the customer)
- "orderCount" (numeric: total number of orders placed by customer)
- "discountUsage" (boolean: true if customer bought using a discount code, false otherwise)

Supported comparison operators:
- ">", "<", ">=", "<=", "=", "IN"

Format your output STRICTLY as a valid JSON object. Do not wrap the JSON in markdown code blocks. No conversational text outside the JSON. Just the JSON object.`;

  // Map history to Gemini message schema
  const contents = sortedHistory.map(m => ({
    role: m.sender === 'USER' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));

  let replyMessage;

  if (apiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini request failed: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      const rawText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      logger.info({ rawText }, 'Gemini Chatbot Raw Output');

      let cleanText = rawText.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
      }

      const parsed = JSON.parse(cleanText);

      if (parsed.intent === 'SEGMENT') {
        const rules = parsed.rules || [];
        const segmentName = parsed.segmentName || 'Custom Segment';
        const explanation = parsed.explanation || 'Filtered segment';

        // Compile and run the segment query
        const { sql, params } = compileRulesToSql(workspaceId, rules);
        const results = await prisma.$queryRawUnsafe(sql, ...params);

        // Calculate aggregates
        const aggregates = calculateAggregates(results);
        const aiSummary = await generateSummary(segmentName, aggregates);

        const previewCustomers = results.slice(0, 50).map(row => ({
          id: row.id,
          name: row.name,
          email: row.email,
          city: row.city,
          totalSpend: Number(row.totalSpend),
          orderCount: Number(row.orderCount),
          lastPurchaseDays: row.lastPurchaseDate 
            ? Math.max(0, Math.floor((new Date().getTime() - new Date(row.lastPurchaseDate).getTime()) / 86400000)) 
            : 999
        }));

        replyMessage = await prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            sender: 'AI',
            text: explanation,
            data: {
              segmentName,
              rules,
              count: results.length,
              previewCustomers,
              aiSummary
            }
          }
        });
      } else {
        // CHAT intent
        replyMessage = await prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            sender: 'AI',
            text: parsed.reply || "I am here to help you. Let me know if you'd like to query your customer database."
          }
        });
      }
    } catch (err) {
      logger.error({ error: err.message }, 'Gemini Chatbot Failure. Falling back.');
    }
  }

  // Fallback to simple static rule parsing if Gemini fails or apiKey is missing
  if (!replyMessage) {
    const fallbackMessageText = `I ran a local parser query for: "${messageText}". Let me know if you would like me to set up demographic filters.`;
    replyMessage = await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        sender: 'AI',
        text: fallbackMessageText
      }
    });
  }

  return replyMessage;
}

/**
 * Helper to calculate aggregates from database query results.
 */
function calculateAggregates(results, now = new Date()) {
  const count = results.length;
  if (count === 0) {
    return { count: 0, averageSpend: 0, averageRecencyDays: 0, topCities: [] };
  }

  let totalSpendSum = 0;
  let recencySum = 0;
  const cityCounts = {};

  for (const r of results) {
    totalSpendSum += Number(r.totalSpend || 0);
    if (r.city) {
      cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
    }
    if (r.lastPurchaseDate) {
      const recencyDays = Math.max(0, Math.floor((now.getTime() - new Date(r.lastPurchaseDate).getTime()) / 86400000));
      recencySum += recencyDays;
    }
  }

  const topCities = Object.entries(cityCounts)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    count,
    averageSpend: Math.round(totalSpendSum / count),
    averageRecencyDays: Math.round(recencySum / count),
    topCities
  };
}
