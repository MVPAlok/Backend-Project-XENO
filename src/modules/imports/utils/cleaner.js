/**
 * Unified cleaner utility for normalizing and validating single-dataset row values.
 */

/**
 * Normalize and clean email to lowercase.
 */
export function cleanEmail(email) {
  if (!email) return null;
  const cleaned = email.trim().toLowerCase();
  // Simple check for valid email structure
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw new Error('Malformed email format.');
  }
  return cleaned;
}

/**
 * Normalize and clean phone numbers (removes spaces, country symbols, non-digits).
 */
export function cleanPhone(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.length < 7) {
    throw new Error('Malformed phone number format.');
  }
  return cleaned;
}

/**
 * Normalize and clean gender values to uppercase MALE, FEMALE, OTHER.
 */
export function cleanGender(gender) {
  if (!gender) return null;
  const cleaned = gender.trim().toUpperCase();
  if (['MALE', 'FEMALE', 'OTHER'].includes(cleaned)) {
    return cleaned;
  }
  // Support prefixes
  if (cleaned.startsWith('M')) return 'MALE';
  if (cleaned.startsWith('F')) return 'FEMALE';
  if (cleaned.startsWith('O')) return 'OTHER';
  return 'OTHER';
}

/**
 * Parse and validate decimal numbers.
 */
export function cleanDecimal(amount) {
  if (amount === undefined || amount === null || amount === '') {
    throw new Error('Amount is required.');
  }
  const cleaned = amount.toString().trim();
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error('Amount must be a valid positive number.');
  }
  return parsed;
}

/**
 * Parse and validate date strings.
 */
export function cleanDate(dateStr) {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    throw new Error('Invalid date format.');
  }
  return parsed;
}

/**
 * Clean a single raw row according to custom mappings.
 * Returns { data, errors }
 */
export function cleanRow(rawRow, mappings) {
  const data = {};
  const errors = [];

  // Invert mappings to easily find CSV header key for a system target field
  const invertedMappings = {};
  if (mappings) {
    for (const [csvHeader, systemField] of Object.entries(mappings)) {
      invertedMappings[systemField] = csvHeader;
    }
  }

  // Mappings is an object of targetField: rawHeaderKey
  const getRawValue = (targetField) => {
    const headerKey = invertedMappings[targetField];
    if (!headerKey) return null;
    const value = rawRow[headerKey];
    return value !== undefined ? value.trim() : null;
  };


  // 1. Customer Fields
  try {
    data.firstName = getRawValue('firstName') || '';
    if (invertedMappings['firstName'] && !data.firstName) {
      errors.push('First name is required.');
    }
  } catch (err) {
    errors.push(err.message);
  }

  try {
    data.lastName = getRawValue('lastName');
  } catch (err) {
    errors.push(err.message);
  }

  try {
    data.email = cleanEmail(getRawValue('email'));
  } catch (err) {
    errors.push(err.message);
  }

  try {
    data.phone = cleanPhone(getRawValue('phone'));
  } catch (err) {
    errors.push(err.message);
  }

  try {
    data.gender = cleanGender(getRawValue('gender'));
  } catch (err) {
    errors.push(err.message);
  }

  try {
    data.dateOfBirth = cleanDate(getRawValue('dateOfBirth'));
  } catch (err) {
    errors.push(`Date of birth: ${err.message}`);
  }

  try {
    data.externalId = getRawValue('externalId');
  } catch (err) {
    errors.push(err.message);
  }

  // 2. Order Fields
  try {
    data.externalOrderId = getRawValue('externalOrderId');
  } catch (err) {
    errors.push(err.message);
  }

  try {
    const rawAmount = getRawValue('amount');
    if (rawAmount !== null && rawAmount !== '') {
      data.amount = cleanDecimal(rawAmount);
    } else {
      data.amount = null;
    }
  } catch (err) {
    errors.push(`Amount error: ${err.message}`);
  }

  try {
    data.currency = getRawValue('currency') || 'INR';
  } catch (err) {
    errors.push(err.message);
  }

  try {
    const rawPurchaseDate = getRawValue('purchaseDate');
    if (rawPurchaseDate) {
      data.purchaseDate = cleanDate(rawPurchaseDate);
      if (!data.purchaseDate) {
        errors.push('Purchase date is invalid.');
      }
    } else {
      data.purchaseDate = null;
    }
  } catch (err) {
    errors.push(`Purchase date error: ${err.message}`);
  }

  // Validation Rule: Customer needs at least firstName AND either email or phone
  const hasCustomerInfo = data.firstName || data.email || data.phone || data.lastName;
  if (hasCustomerInfo) {
    if (!data.firstName) {
      errors.push('Customer first name is required.');
    }
    if (!data.email && !data.phone) {
      errors.push('Customer email or phone is required.');
    }
  }

  // Validation Rule: Order needs at least purchaseDate and amount if externalOrderId is present
  if (data.externalOrderId) {
    if (data.amount === null) {
      errors.push('Order amount is required when order ID is present.');
    }
    if (!data.purchaseDate) {
      errors.push('Order purchase date is required when order ID is present.');
    }
  }

  return {
    raw: rawRow,
    data,
    errors,
    isValid: errors.length === 0
  };
}
