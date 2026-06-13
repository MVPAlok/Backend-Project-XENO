/**
 * Heuristics to detect whether header columns correspond to customer or order attributes.
 */
export function detectFieldCategory(header) {
  if (!header) return null;
  const h = header.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');

  // Customer First Name
  if (['firstname', 'f_name', 'first_name', 'first', 'name', 'customer_name', 'customername'].includes(h)) {
    return { field: 'firstName', confidence: 0.92, explanation: `Likely maps to Customer First Name based on header '${header}'.` };
  }
  // Customer Last Name
  if (['lastname', 'l_name', 'last_name', 'last'].includes(h)) {
    return { field: 'lastName', confidence: 0.95, explanation: `Likely maps to Customer Last Name based on header '${header}'.` };
  }
  // Email
  if (['email', 'email_address', 'emailaddress', 'mail'].includes(h)) {
    return { field: 'email', confidence: 0.98, explanation: `Likely maps to Customer Email based on header '${header}'.` };
  }
  // Phone
  if (['phone', 'phone_number', 'phonenumber', 'mobile', 'tel', 'contact'].includes(h)) {
    return { field: 'phone', confidence: 0.96, explanation: `Likely maps to Customer Phone based on header '${header}'.` };
  }
  // Gender
  if (['gender', 'sex'].includes(h)) {
    return { field: 'gender', confidence: 0.90, explanation: `Likely maps to Customer Gender based on header '${header}'.` };
  }
  // Date of Birth
  if (['dateofbirth', 'dob', 'birthdate', 'birth_date', 'date_of_birth'].includes(h)) {
    return { field: 'dateOfBirth', confidence: 0.95, explanation: `Likely maps to Customer Date of Birth based on header '${header}'.` };
  }
  // External Customer ID
  if (['customerid', 'customer_id', 'externalid', 'external_id', 'cust_id', 'custid', 'external_customer_id'].includes(h)) {
    return { field: 'externalId', confidence: 0.88, explanation: `Likely maps to Customer External ID based on header '${header}'.` };
  }

  // Order ID
  if (['orderid', 'order_id', 'externalorderid', 'external_order_id', 'transaction_id', 'transactionid', 'invoice_id', 'invoiceid'].includes(h)) {
    return { field: 'externalOrderId', confidence: 0.95, explanation: `Likely maps to Order External ID based on header '${header}'.` };
  }
  // Order Amount / Revenue
  if (['amount', 'price', 'revenue', 'order_amount', 'orderamount', 'total', 'order_total', 'ordertotal'].includes(h)) {
    return { field: 'amount', confidence: 0.96, explanation: `Likely maps to Order Amount based on header '${header}'.` };
  }
  // Currency
  if (['currency'].includes(h)) {
    return { field: 'currency', confidence: 0.95, explanation: `Likely maps to Order Currency based on header '${header}'.` };
  }
  // Purchase Date
  if (['purchasedate', 'purchase_date', 'order_date', 'orderdate', 'date', 'timestamp', 'created_at'].includes(h)) {
    return { field: 'purchaseDate', confidence: 0.93, explanation: `Likely maps to Order Purchase Date based on header '${header}'.` };
  }

  return null;
}
