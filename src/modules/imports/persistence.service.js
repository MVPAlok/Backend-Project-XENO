import { randomUUID } from 'crypto';
import * as customerRepository from '../customers/customer.repository.js';
import * as orderRepository from '../orders/order.repository.js';
import * as repository from './import.repository.js';
import { cleanRow } from './utils/cleaner.js';
import logger from '../../utils/logger.js';

/**
 * Persists preview data after user confirmation.
 */
export async function persistImport(workspaceId, jobId, userId, { mappings, resolutionStrategy, overrides = [] }) {
  const job = await repository.findById(jobId);
  if (!job || job.workspaceId !== workspaceId) {
    throw new Error('Import job not found.');
  }
  if (job.status !== 'PREVIEW_READY') {
    throw new Error('Job is not in PREVIEW_READY state.');
  }

  // Update status to CONFIRMED, then PROCESSING
  await repository.updateJob(job.id, {
    status: 'CONFIRMED',
    resolutionStrategy,
    confirmedAt: new Date(),
    confirmedBy: userId
  });

  await repository.updateJob(job.id, {
    status: 'PROCESSING'
  });

  const startTime = Date.now();
  logger.info({ workspaceId, importJobId: job.id, uploadedBy: userId }, 'Persistence Ingestion Started');

  try {
    const previewPayload = job.previewData;
    if (!previewPayload || !previewPayload.rawRows) {
      throw new Error('No preview rows available to persist.');
    }

    const rawRows = previewPayload.rawRows;
    const totalRows = rawRows.length;

    let processedRows = 0;
    let successfulRows = 0;
    let failedRows = 0;

    // Load active workspace customers to build maps
    const existingCustomers = await customerRepository.findByWorkspace(workspaceId);
    const emailMap = new Map();
    const phoneMap = new Map();
    for (const c of existingCustomers) {
      if (c.email) emailMap.set(c.email.toLowerCase(), c);
      if (c.phone) phoneMap.set(c.phone, c);
    }

    // Load existing orders in workspace matching raw rows
    const orderIds = rawRows
      .map(row => {
        const mapped = {};
        for (const [rawHeader, targetKey] of Object.entries(mappings)) {
          if (row[rawHeader] !== undefined) mapped[targetKey] = row[rawHeader];
        }
        return mapped.externalOrderId;
      })
      .filter(Boolean);

    const existingOrders = await orderRepository.findByExternalIds(workspaceId, orderIds);
    const orderMap = new Map(existingOrders.map(o => [o.externalOrderId, o]));

    const newCustomers = [];
    const customerUpdates = [];
    const newOrders = [];
    const orderUpdates = [];

    // Keep track of new customer objects we generate in this run to avoid duplicates in the same CSV
    const newCustomersEmailMap = new Map();
    const newCustomersPhoneMap = new Map();

    for (const rawRow of rawRows) {
      try {
        const cleaned = cleanRow(rawRow, mappings);
        if (!cleaned.isValid) {
          failedRows++;
          processedRows++;
          continue;
        }

        const { data } = cleaned;

        // 1. Resolve Customer
        let matchedCustomer = null;
        if (data.email) {
          matchedCustomer = emailMap.get(data.email) || newCustomersEmailMap.get(data.email);
        }
        if (!matchedCustomer && data.phone) {
          matchedCustomer = phoneMap.get(data.phone) || newCustomersPhoneMap.get(data.phone);
        }

        let customerId = null;
        let customerSkipped = false;

        if (matchedCustomer) {
          // Find conflict strategy override or fallback to global strategy
          let strategy = resolutionStrategy;
          const override = overrides.find(o => 
            (data.email && o.identifier === data.email) || 
            (data.phone && o.identifier === data.phone)
          );
          if (override) {
            strategy = override.strategy;
          }

          if (strategy === 'SKIP') {
            customerSkipped = true;
            processedRows++;
            successfulRows++;
            continue; // Ignore row
          }

          customerId = matchedCustomer.id;

          if (strategy === 'UPDATE_EXISTING') {
            const updateData = {};
            if (data.firstName && data.firstName !== matchedCustomer.firstName) updateData.firstName = data.firstName;
            if (data.lastName !== undefined && data.lastName !== matchedCustomer.lastName) updateData.lastName = data.lastName;
            if (data.email !== undefined && data.email !== matchedCustomer.email) updateData.email = data.email;
            if (data.phone !== undefined && data.phone !== matchedCustomer.phone) updateData.phone = data.phone;
            if (data.gender !== undefined && data.gender !== matchedCustomer.gender) updateData.gender = data.gender;
            if (data.dateOfBirth !== undefined && data.dateOfBirth !== matchedCustomer.dateOfBirth) updateData.dateOfBirth = data.dateOfBirth;
            if (data.externalId !== undefined && data.externalId !== matchedCustomer.externalId) updateData.externalId = data.externalId;

            if (Object.keys(updateData).length > 0) {
              const existingUpdateIndex = customerUpdates.findIndex(u => u.id === customerId);
              if (existingUpdateIndex >= 0) {
                Object.assign(customerUpdates[existingUpdateIndex].data, updateData);
              } else {
                customerUpdates.push({ id: customerId, data: updateData });
              }
              Object.assign(matchedCustomer, updateData); // Sync in-memory
            }
          } else {
            // KEEP_EXISTING: only fill in missing/null fields
            const updateData = {};
            if (matchedCustomer.lastName === null && data.lastName !== null) updateData.lastName = data.lastName;
            if (matchedCustomer.email === null && data.email !== null) updateData.email = data.email;
            if (matchedCustomer.phone === null && data.phone !== null) updateData.phone = data.phone;
            if (matchedCustomer.gender === null && data.gender !== null) updateData.gender = data.gender;
            if (matchedCustomer.dateOfBirth === null && data.dateOfBirth !== null) updateData.dateOfBirth = data.dateOfBirth;
            if (matchedCustomer.externalId === null && data.externalId !== null) updateData.externalId = data.externalId;

            if (Object.keys(updateData).length > 0) {
              const existingUpdateIndex = customerUpdates.findIndex(u => u.id === customerId);
              if (existingUpdateIndex >= 0) {
                Object.assign(customerUpdates[existingUpdateIndex].data, updateData);
              } else {
                customerUpdates.push({ id: customerId, data: updateData });
              }
              Object.assign(matchedCustomer, updateData); // Sync in-memory
            }
          }
        } else {
          // New customer
          customerId = randomUUID();
          const customerObj = {
            id: customerId,
            workspaceId,
            firstName: data.firstName || '',
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
            gender: data.gender,
            dateOfBirth: data.dateOfBirth,
            externalId: data.externalId
          };
          newCustomers.push(customerObj);
          if (data.email) {
            emailMap.set(data.email, customerObj);
            newCustomersEmailMap.set(data.email, customerObj);
          }
          if (data.phone) {
            phoneMap.set(data.phone, customerObj);
            newCustomersPhoneMap.set(data.phone, customerObj);
          }
        }

        // 2. Resolve Order
        if (data.externalOrderId && customerId) {
          const matchedOrder = orderMap.get(data.externalOrderId);
          let orderStrategy = resolutionStrategy;
          const orderOverride = overrides.find(o => o.identifier === data.externalOrderId);
          if (orderOverride) {
            orderStrategy = orderOverride.strategy;
          }

          if (matchedOrder) {
            if (orderStrategy === 'SKIP') {
              processedRows++;
              successfulRows++;
              continue;
            }

            if (orderStrategy === 'UPDATE_EXISTING') {
              const updateData = {};
              if (data.amount !== null && Number(data.amount) !== Number(matchedOrder.amount)) updateData.amount = data.amount;
              if (data.currency && data.currency !== matchedOrder.currency) updateData.currency = data.currency;
              if (data.purchaseDate && data.purchaseDate.getTime() !== new Date(matchedOrder.purchaseDate).getTime()) {
                updateData.purchaseDate = data.purchaseDate;
              }
              if (customerId && customerId !== matchedOrder.customerId) updateData.customerId = customerId;

              if (Object.keys(updateData).length > 0) {
                orderUpdates.push({ id: matchedOrder.id, data: updateData });
                Object.assign(matchedOrder, updateData); // Sync in-memory
              }
            }
          } else {
            newOrders.push({
              id: randomUUID(),
              workspaceId,
              customerId,
              externalOrderId: data.externalOrderId,
              amount: data.amount,
              currency: data.currency || 'INR',
              purchaseDate: data.purchaseDate
            });
            orderMap.set(data.externalOrderId, {
              id: newOrders[newOrders.length - 1].id,
              workspaceId,
              customerId,
              externalOrderId: data.externalOrderId,
              amount: data.amount,
              currency: data.currency || 'INR',
              purchaseDate: data.purchaseDate
            });
          }
        }

        successfulRows++;
        processedRows++;
      } catch (err) {
        failedRows++;
        processedRows++;
      }
    }

    // Bulk transactional writes
    await customerRepository.bulkWriteCustomers(newCustomers, customerUpdates);
    await orderRepository.bulkWriteOrders(newOrders, orderUpdates);

    const duration = Date.now() - startTime;
    const completedJob = await repository.updateJob(job.id, {
      status: 'COMPLETED',
      totalRows,
      processedRows,
      successfulRows,
      failedRows,
      completedAt: new Date()
    });

    logger.info({
      workspaceId,
      importJobId: job.id,
      successfulRows,
      failedRows,
      duration
    }, 'Ingestion Persistence Completed');

    return completedJob;
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error({
      workspaceId,
      importJobId: job.id,
      errorMessage: err.message,
      duration
    }, 'Ingestion Persistence Failed');

    return repository.updateJob(job.id, {
      status: 'FAILED',
      errorMessage: err.message,
      completedAt: new Date()
    });
  }
}
