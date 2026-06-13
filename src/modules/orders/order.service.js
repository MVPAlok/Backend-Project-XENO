import * as repository from './order.repository.js';

export async function findByExternalIds(workspaceId, externalOrderIds) {
  return repository.findByExternalIds(workspaceId, externalOrderIds);
}
