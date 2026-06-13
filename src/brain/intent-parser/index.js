import { ValidationError } from '../../utils/errors.js';

/**
 * Parses user natural language prompts or predefined goals into structured segment rules.
 * This simulates an LLM call.
 */
export async function parseIntent(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    throw new ValidationError('Prompt must be a non-empty string.');
  }

  const p = prompt.trim().toLowerCase();

  // Test triggers for invalid outputs
  if (p === 'trigger_invalid_json') {
    // Return non-JSON raw string
    return 'Raw non-JSON string returned by LLM.';
  }

  if (p === 'trigger_invalid_field') {
    return JSON.stringify({
      intent: 'SEGMENT',
      segmentName: 'Invalid Field Segment',
      rules: [
        {
          field: 'unsupportedFieldXYZ',
          operator: '=',
          value: 'value'
        }
      ]
    });
  }

  if (p === 'trigger_invalid_operator') {
    return JSON.stringify({
      intent: 'SEGMENT',
      segmentName: 'Invalid Operator Segment',
      rules: [
        {
          field: 'city',
          operator: 'LIKE',
          value: 'Mumbai'
        }
      ]
    });
  }

  // Predefined/Conversational AI logic mapping
  let segmentName = 'Custom Audience';
  const rules = [];
  let explanationParts = [];

  // Mumbai check
  if (p.includes('mumbai')) {
    rules.push({ field: 'city', operator: '=', value: 'Mumbai' });
    explanationParts.push('customers located in Mumbai');
  }

  // Skincare check
  if (p.includes('skincare')) {
    rules.push({ field: 'category', operator: '=', value: 'skincare' });
    explanationParts.push('who purchased skincare products');
  }

  // Order count / frequency check
  if (p.includes('more than twice') || p.includes('twice')) {
    rules.push({ field: 'orderCount', operator: '>', value: 2 });
    explanationParts.push('more than twice (order count > 2)');
  } else if (p.includes('loyal')) {
    segmentName = 'Loyal Customers';
    rules.push({ field: 'orderCount', operator: '>=', value: 5 });
    explanationParts.push('who are loyal (with 5 or more orders)');
  }

  // Recency check (45 days, 6 months / six months, inactive)
  if (p.includes('45 days')) {
    rules.push({ field: 'lastPurchaseDays', operator: '>=', value: 45 });
    explanationParts.push('have not purchased in the last 45 days');
  } else if (p.includes('six months') || p.includes('6 months') || p.includes('six-months')) {
    segmentName = 'Dormant High Value Customers';
    rules.push({ field: 'lastPurchaseDays', operator: '>=', value: 180 });
    explanationParts.push('have not purchased in over 6 months (180 days)');
  } else if (p.includes('churn') || p.includes('churn risk')) {
    segmentName = 'Churn Risk Customers';
    rules.push({ field: 'lastPurchaseDays', operator: '>=', value: 90 });
    explanationParts.push('likely to churn (no purchases in last 90 days)');
  } else if (p.includes('inactive') || p.includes('dormant')) {
    segmentName = 'Inactive Customers';
    rules.push({ field: 'lastPurchaseDays', operator: '>=', value: 60 });
    explanationParts.push('are inactive (no purchases in last 60 days)');
  }

  // Spend check
  if (p.includes('spent heavily') || p.includes('high-value') || p.includes('high value')) {
    segmentName = segmentName === 'Custom Audience' ? 'High Value Customers' : segmentName;
    rules.push({ field: 'totalSpend', operator: '>', value: 5000 });
    explanationParts.push('historically spent heavily (over ₹5,000)');
  }

  // Average Order Value check
  if (p.includes('average order value') || p.includes('aov')) {
    segmentName = 'High Average Order Value';
    rules.push({ field: 'averageOrderValue', operator: '>', value: 1500 });
    explanationParts.push('with a high average order value (over ₹1,500)');
  }

  // Discount sensitivity
  if (p.includes('discount-sensitive') || p.includes('discount sensitive') || p.includes('discount')) {
    segmentName = 'Discount Sensitive Customers';
    rules.push({ field: 'discountUsage', operator: '=', value: true });
    explanationParts.push('who frequently use discounts');
  }

  // Promote new collections
  if (p.includes('promote new collections') || p.includes('new collection')) {
    segmentName = 'New Collection Targets';
    // Active customers in the last 30 days
    rules.push({ field: 'lastPurchaseDays', operator: '<', value: 30 });
    explanationParts.push('active customers who purchased in the last 30 days');
  }

  // Fallback if no rules matched
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
