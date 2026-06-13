/**
 * pure conflict detector functions mapping cleaned rows to DB conflicts.
 */
export function detectConflicts(cleanedRows, existingCustomers, existingOrders) {
  const dbEmailMap = new Map();
  const dbPhoneMap = new Map();
  const dbOrderMap = new Map();

  for (const c of existingCustomers) {
    if (c.email) dbEmailMap.set(c.email.toLowerCase(), c);
    if (c.phone) dbPhoneMap.set(c.phone, c);
  }
  for (const o of existingOrders) {
    if (o.externalOrderId) dbOrderMap.set(o.externalOrderId, o);
  }

  const conflicts = {
    customers: [],
    orders: []
  };

  const seenInFileEmail = new Set();
  const seenInFilePhone = new Set();
  const seenInFileOrder = new Set();

  for (const row of cleanedRows) {
    if (!row.isValid) continue;
    const { data } = row;

    let customerConflicted = false;
    let customerConflictReason = '';
    let dbCustomer = null;

    if (data.email) {
      if (dbEmailMap.has(data.email)) {
        customerConflicted = true;
        dbCustomer = dbEmailMap.get(data.email);
        customerConflictReason = `Customer email '${data.email}' already exists in database.`;
      }
    }
    if (!customerConflicted && data.phone) {
      if (dbPhoneMap.has(data.phone)) {
        customerConflicted = true;
        dbCustomer = dbPhoneMap.get(data.phone);
        customerConflictReason = `Customer phone '${data.phone}' already exists in database.`;
      }
    }

    if (customerConflicted && dbCustomer) {
      conflicts.customers.push({
        email: data.email,
        phone: data.phone,
        incoming: data,
        existing: {
          id: dbCustomer.id,
          firstName: dbCustomer.firstName,
          lastName: dbCustomer.lastName,
          email: dbCustomer.email,
          phone: dbCustomer.phone
        },
        reason: customerConflictReason
      });
    }

    if (data.externalOrderId) {
      if (dbOrderMap.has(data.externalOrderId)) {
        const dbOrder = dbOrderMap.get(data.externalOrderId);
        conflicts.orders.push({
          externalOrderId: data.externalOrderId,
          incoming: data,
          existing: {
            id: dbOrder.id,
            externalOrderId: dbOrder.externalOrderId,
            amount: dbOrder.amount,
            purchaseDate: dbOrder.purchaseDate
          },
          reason: `Order ID '${data.externalOrderId}' already exists in database.`
        });
      }
    }
  }

  return conflicts;
}
