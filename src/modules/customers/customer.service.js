import * as repository from './customer.repository.js';

/**
 * Find customer by email or phone.
 */
export async function getCustomerByIdentifier(workspaceId, email, phone) {
  return repository.findCustomerByIdentifier(workspaceId, email, phone);
}
