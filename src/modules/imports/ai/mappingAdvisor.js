import { detectFieldCategory } from '../utils/detector.js';

/**
 * AI mapping advisor to suggest field mappings and conflict resolution strategies.
 */
export function getAdvisorSuggestions(headers) {
  const mappings = {};
  const explanations = {};
  const confidences = {};

  for (const header of headers) {
    const match = detectFieldCategory(header);
    if (match) {
      mappings[header] = match.field;
      confidences[header] = match.confidence;
      explanations[header] = match.explanation;
    }
  }

  // Suggest conflict strategy
  // Defaults to KEEP_EXISTING as a safe human-first principle.
  const suggestedStrategy = 'KEEP_EXISTING';
  const strategyExplanation = 'KEEP_EXISTING is recommended by default to prevent overwriting existing database customer data unless explicit approval is given.';

  return {
    mappings,
    confidences,
    explanations,
    suggestedStrategy,
    strategyExplanation
  };
}
