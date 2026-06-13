/**
 * Helper utility to analyze raw and cleaned rows for duplicates.
 */
export function detectInFileDuplicates(rawRows, cleanedRows) {
  const seenRawRows = new Set();
  const seenCustomerIds = new Set();
  const seenEmails = new Set();
  const seenPhones = new Set();
  const seenOrderIds = new Set();

  let exactDuplicatesCount = 0;
  let duplicateCustomerIdsCount = 0;
  let duplicateEmailsCount = 0;
  let duplicatePhonesCount = 0;
  let duplicateOrderIdsCount = 0;

  const exactDuplicateIndices = new Set();
  const duplicateIndices = new Set();

  for (let i = 0; i < cleanedRows.length; i++) {
    const rawRow = rawRows[i];
    const cleaned = cleanedRows[i];
    
    // Sort keys before stringifying to ensure order independence in matching exact duplicates
    const rawStr = JSON.stringify(Object.keys(rawRow).sort().reduce((acc, key) => {
      acc[key] = rawRow[key] !== undefined && rawRow[key] !== null ? rawRow[key].toString().trim() : '';
      return acc;
    }, {}));

    if (seenRawRows.has(rawStr)) {
      exactDuplicatesCount++;
      exactDuplicateIndices.add(i);
      duplicateIndices.add(i);
      continue; // Skip further checks for this row since it's an exact duplicate
    }
    seenRawRows.add(rawStr);

    if (!cleaned.isValid) continue;

    const { data } = cleaned;
    let isRowDuplicate = false;

    // Check duplicate Customer ID (externalId)
    if (data.externalId) {
      if (seenCustomerIds.has(data.externalId)) {
        duplicateCustomerIdsCount++;
        isRowDuplicate = true;
      } else {
        seenCustomerIds.add(data.externalId);
      }
    }

    // Check duplicate Email
    if (data.email) {
      const emailLower = data.email.toLowerCase();
      if (seenEmails.has(emailLower)) {
        duplicateEmailsCount++;
        isRowDuplicate = true;
      } else {
        seenEmails.add(emailLower);
      }
    }

    // Check duplicate Phone
    if (data.phone) {
      if (seenPhones.has(data.phone)) {
        duplicatePhonesCount++;
        isRowDuplicate = true;
      } else {
        seenPhones.add(data.phone);
      }
    }

    // Check duplicate Order ID (externalOrderId)
    if (data.externalOrderId) {
      if (seenOrderIds.has(data.externalOrderId)) {
        duplicateOrderIdsCount++;
        isRowDuplicate = true;
      } else {
        seenOrderIds.add(data.externalOrderId);
      }
    }

    if (isRowDuplicate) {
      duplicateIndices.add(i);
    }
  }

  return {
    exactDuplicatesCount,
    duplicateCustomerIdsCount,
    duplicateEmailsCount,
    duplicatePhonesCount,
    duplicateOrderIdsCount,
    exactDuplicateIndices,
    duplicateIndices,
    totalInFileDuplicates: exactDuplicatesCount + duplicateCustomerIdsCount
  };
}
