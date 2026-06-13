/**
 * Synchronously parses CSV content string into an array of objects.
 * Handles headers, double quotes, commas within fields, and escaped quotes ("").
 * @param {string} csvText - The CSV content
 * @returns {Array<Object>} Array of records mapped to header keys
 */
export function parseCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];

  // Normalize newlines
  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped double quote inside quotes
          currentField += '"';
          i++; // skip next quote
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }

  // Handle remaining field or row at end of file
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Filter out completely empty rows (rows containing only empty strings)
  const nonEmpRows = rows.filter(row => row.some(cell => cell.trim() !== ''));
  if (nonEmpRows.length === 0) return [];

  const headers = nonEmpRows[0].map(h => h.trim());
  const records = [];

  for (let r = 1; r < nonEmpRows.length; r++) {
    const values = nonEmpRows[r];
    const record = {};
    headers.forEach((header, index) => {
      if (header) {
        const value = values[index] !== undefined ? values[index].trim() : '';
        record[header] = value;
      }
    });
    records.push(record);
  }

  return records;
}
export default parseCSV;
