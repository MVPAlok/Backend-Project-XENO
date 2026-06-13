/**
 * Normalizes and validates a single order row.
 * Returns cleaned object or throws an error.
 */
export function cleanOrderRow(row) {
  if (!row || Object.keys(row).length === 0) {
    throw new Error('Empty row');
  }

  // Trim whitespace
  const rawCustomerEmail = (row.customerEmail || row.customer_email || '').trim();
  const rawCustomerPhone = (row.customerPhone || row.customer_phone || '').trim();
  const rawAmount = (row.amount || '').trim();
  const rawPurchaseDate = (row.purchaseDate || row.purchase_date || '').trim();
  const rawExternalOrderId = (row.externalOrderId || row.external_order_id || '').trim();
  const rawCurrency = (row.currency || '').trim();

  // Validate required linking identifier
  let customerEmail = null;
  if (rawCustomerEmail) {
    customerEmail = rawCustomerEmail.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      throw new Error(`Invalid customerEmail format: ${rawCustomerEmail}`);
    }
  }

  let customerPhone = null;
  if (rawCustomerPhone) {
    customerPhone = rawCustomerPhone.replace(/[^\d]/g, '');
  }

  if (!customerEmail && !customerPhone) {
    throw new Error('Order record must contain either customerEmail or customerPhone to link to a customer');
  }

  // Validate and parse amount (must be positive decimal)
  if (!rawAmount) {
    throw new Error('Missing required field: amount');
  }
  const amountVal = parseFloat(rawAmount);
  if (isNaN(amountVal)) {
    throw new Error(`Invalid amount format: ${rawAmount}`);
  }
  if (amountVal <= 0) {
    throw new Error(`Amount must be a positive number: ${rawAmount}`);
  }

  // Validate and parse purchaseDate
  if (!rawPurchaseDate) {
    throw new Error('Missing required field: purchaseDate');
  }
  const purchaseDate = new Date(rawPurchaseDate);
  if (isNaN(purchaseDate.getTime())) {
    throw new Error(`Invalid purchaseDate: ${rawPurchaseDate}`);
  }

  // Currency default
  const currency = rawCurrency || 'INR';

  const externalOrderId = rawExternalOrderId || null;

  return {
    customerEmail,
    customerPhone,
    amount: amountVal,
    currency,
    purchaseDate,
    externalOrderId
  };
}
