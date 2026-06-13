import * as customerRepository from '../customers/customer.repository.js';
import * as orderRepository from '../orders/order.repository.js';
import { detectConflicts } from './utils/conflictDetector.js';

/**
 * Identify customer and order conflicts against the database.
 */
export async function getConflictsForRows(workspaceId, cleanedRows) {
  const orderIds = cleanedRows
    .map(row => row.isValid && row.data.externalOrderId)
    .filter(Boolean);

  // Fetch all active workspace customers and orders matching incoming IDs
  const existingCustomers = await customerRepository.findByWorkspace(workspaceId);
  const existingOrders = await orderRepository.findByExternalIds(workspaceId, orderIds);

  return detectConflicts(cleanedRows, existingCustomers, existingOrders);
}
