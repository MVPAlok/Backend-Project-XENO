/**
 * Generates natural language summaries of segment metrics.
 * This simulates an LLM call.
 */
export async function generateSummary(segmentName, aggregates) {
  const { count, averageSpend, averageRecencyDays, topCities } = aggregates;

  const cityStr = topCities && topCities.length > 0 
    ? ` primarily located in cities like ${topCities.map(c => c.city).join(', ')}`
    : '';

  return `I found ${count} ${segmentName.toLowerCase()} customers${cityStr}. ` +
    `On average, these customers spent ₹${averageSpend} and had a purchase recency of ${averageRecencyDays} days. ` +
    `These statistics suggest they are highly relevant candidates for your campaign targeting goals.`;
}
