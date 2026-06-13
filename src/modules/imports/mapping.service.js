/**
 * Applies header mapping to raw records.
 */
export function mapRow(rawRow, mappings) {
  const mapped = {};
  for (const [rawHeader, targetKey] of Object.entries(mappings)) {
    if (rawRow[rawHeader] !== undefined) {
      mapped[targetKey] = rawRow[rawHeader];
    }
  }
  return mapped;
}
