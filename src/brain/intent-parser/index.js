import { ValidationError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

const SYSTEM_INSTRUCTION = `You are the AI Audience Intelligence engine for XENO CRM.
Your task is to parse the user's natural language marketing goal into a structured JSON query object representing a customer segment.

Supported fields:
- "totalSpend" (numeric: customer's total spent amount across all orders)
- "lastPurchaseDays" (numeric: days since customer's last purchase date)
- "averageOrderValue" (numeric: customer's average spent per order)
- "city" (string: customer's location city)
- "category" (string: product category purchased by the customer)
- "orderCount" (numeric: total number of orders placed by customer)
- "discountUsage" (boolean: true if customer bought using a discount code, false otherwise)

Supported comparison operators:
- ">", "<", ">=", "<=", "=", "IN"

You MUST output strictly valid JSON conforming to the schema.
Do NOT surround the JSON in markdown code blocks. No backticks. No additional conversational text. Just raw JSON.

Schema:
{
  "intent": "SEGMENT",
  "segmentName": "A concise descriptive title for this customer segment",
  "rules": [
    {
      "field": "field name",
      "operator": "comparison operator",
      "value": "JSON stringified value (number, boolean, string or array of strings/numbers for IN)"
    }
  ],
  "explanation": "A short summary explaining who this audience segment targets."
}
`;

/**
 * Parses user natural language prompts or predefined goals into structured segment rules.
 * Uses live Gemini/OpenAI API from environment variables if present, otherwise falls back to static parsing rules.
 */
export async function parseIntent(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    throw new ValidationError('Prompt must be a non-empty string.');
  }

  const p = prompt.trim();
  const lowerPrompt = p.toLowerCase();

  // Test triggers for validation tests
  if (lowerPrompt === 'trigger_invalid_json') {
    return 'Raw non-JSON string returned by LLM.';
  }
  if (lowerPrompt === 'trigger_invalid_field') {
    return JSON.stringify({
      intent: 'SEGMENT',
      segmentName: 'Invalid Field Segment',
      rules: [{ field: 'unsupportedFieldXYZ', operator: '=', value: 'value' }]
    });
  }
  if (lowerPrompt === 'trigger_invalid_operator') {
    return JSON.stringify({
      intent: 'SEGMENT',
      segmentName: 'Invalid Operator Segment',
      rules: [{ field: 'city', operator: 'LIKE', value: 'Mumbai' }]
    });
  }

  // Check if API credentials exist in Env
  const provider = process.env.LLM_PROVIDER || 'gemini';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash');

  if (apiKey) {
    try {
      logger.info({ provider, model }, 'Invoking live LLM parser');
      let responseText = '';

      if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_INSTRUCTION },
              { role: 'user', content: p }
            ],
            temperature: 0.1
          })
        });

        if (!response.ok) {
          throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        responseText = data.choices?.[0]?.message?.content || '';
      } else {
        // Default to Gemini API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nUser Prompt: ${p}` }]
            }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Gemini request failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }

      if (responseText) {
        logger.info({ responseText }, 'Raw AI Response');
        // Clean markdown backticks just in case
        let cleanText = responseText.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
        }
        
        // Ensure it is valid JSON
        JSON.parse(cleanText);
        return cleanText;
      }
    } catch (err) {
      logger.warn({ error: err.message }, 'Live LLM parser call failed. Falling back to rule-based parser.');
    }
  }

  // Static rule-based parser fallback (keeps all existing logic)
  let segmentName = 'Custom Audience';
  const rules = [];
  let explanationParts = [];

  if (lowerPrompt.includes('mumbai')) {
    rules.push({ field: 'city', operator: '=', value: 'Mumbai' });
    explanationParts.push('customers located in Mumbai');
  }
  if (lowerPrompt.includes('skincare')) {
    rules.push({ field: 'category', operator: '=', value: 'skincare' });
    explanationParts.push('who purchased skincare products');
  }
  if (lowerPrompt.includes('more than twice') || lowerPrompt.includes('twice')) {
    rules.push({ field: 'orderCount', operator: '>', value: 2 });
    explanationParts.push('more than twice (order count > 2)');
  } else if (lowerPrompt.includes('loyal')) {
    segmentName = 'Loyal Customers';
    rules.push({ field: 'orderCount', operator: '>=', value: 5 });
    explanationParts.push('who are loyal (with 5 or more orders)');
  }
  if (lowerPrompt.includes('45 days')) {
    rules.push({ field: 'lastPurchaseDays', operator: '>=', value: 45 });
    explanationParts.push('have not purchased in the last 45 days');
  } else if (lowerPrompt.includes('six months') || lowerPrompt.includes('6 months') || lowerPrompt.includes('six-months')) {
    segmentName = 'Dormant High Value Customers';
    rules.push({ field: 'lastPurchaseDays', operator: '>=', value: 180 });
    explanationParts.push('have not purchased in over 6 months (180 days)');
  } else if (lowerPrompt.includes('churn') || lowerPrompt.includes('churn risk')) {
    segmentName = 'Churn Risk Customers';
    rules.push({ field: 'lastPurchaseDays', operator: '>=', value: 90 });
    explanationParts.push('likely to churn (no purchases in last 90 days)');
  } else if (lowerPrompt.includes('inactive') || lowerPrompt.includes('dormant')) {
    segmentName = 'Inactive Customers';
    rules.push({ field: 'lastPurchaseDays', operator: '>=', value: 60 });
    explanationParts.push('are inactive (no purchases in last 60 days)');
  }
  if (lowerPrompt.includes('spent heavily') || lowerPrompt.includes('high-value') || lowerPrompt.includes('high value')) {
    segmentName = segmentName === 'Custom Audience' ? 'High Value Customers' : segmentName;
    rules.push({ field: 'totalSpend', operator: '>', value: 5000 });
    explanationParts.push('historically spent heavily (over ₹5,000)');
  }
  if (lowerPrompt.includes('average order value') || lowerPrompt.includes('aov')) {
    segmentName = 'High Average Order Value';
    rules.push({ field: 'averageOrderValue', operator: '>', value: 1500 });
    explanationParts.push('with a high average order value (over ₹1,500)');
  }
  if (lowerPrompt.includes('discount-sensitive') || lowerPrompt.includes('discount sensitive') || lowerPrompt.includes('discount')) {
    segmentName = 'Discount Sensitive Customers';
    rules.push({ field: 'discountUsage', operator: '=', value: true });
    explanationParts.push('who frequently use discounts');
  }
  if (lowerPrompt.includes('promote new collections') || lowerPrompt.includes('new collection')) {
    segmentName = 'New Collection Targets';
    rules.push({ field: 'lastPurchaseDays', operator: '<', value: 30 });
    explanationParts.push('active customers who purchased in the last 30 days');
  }
  if (rules.length === 0) {
    rules.push({ field: 'totalSpend', operator: '>', value: 0 });
    explanationParts.push('all active customers with recorded purchases');
  }

  const explanation = `I found customers ${explanationParts.join(', and ')}.`;

  return JSON.stringify({
    intent: 'SEGMENT',
    segmentName,
    rules,
    explanation
  });
}
