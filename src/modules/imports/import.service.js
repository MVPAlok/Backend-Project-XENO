import { randomUUID } from 'crypto';
import * as repository from './import.repository.js';
import * as customerRepository from '../customers/customer.repository.js';
import * as orderRepository from '../orders/order.repository.js';
import { parseCSV } from './utils/csvParser.js';
import { cleanCustomerRow } from './utils/customerCleaner.js';
import { cleanOrderRow } from './utils/orderCleaner.js';
import { NotFoundError, AuthorizationError } from '../../utils/errors.js';
import { CSVParseError, ImportError } from './import.errors.js';
import logger from '../../utils/logger.js';

/**
 * Handle customer CSV imports.
 */
export async function importCustomers(workspaceId, userId, file) {
  if (!file || !file.buffer) {
    throw new ImportError('No file uploaded or file is empty.');
  }

  const job = await repository.createJob({
    workspaceId,
    uploadedBy: userId,
    type: 'CUSTOMER',
    fileName: file.originalname
  });

  const startTime = Date.now();
  logger.info({ workspaceId, importJobId: job.id, uploadedBy: userId }, 'Import Started');

  try {
    await repository.updateJob(job.id, { status: 'PROCESSING' });

    const csvText = file.buffer.toString('utf8');
    const records = parseCSV(csvText);
    const totalRows = records.length;

    let processedRows = 0;
    let successfulRows = 0;
    let failedRows = 0;

    // Fetch existing customers in workspace to build in-memory map
    const existingCustomers = await customerRepository.findByWorkspace(workspaceId);
    
    // In-memory maps mapping email/phone to the customer object
    const emailMap = new Map();
    const phoneMap = new Map();

    for (const c of existingCustomers) {
      if (c.email) emailMap.set(c.email.toLowerCase(), c);
      if (c.phone) phoneMap.set(c.phone, c);
    }

    const newCustomers = [];
    const updates = [];

    for (const record of records) {
      try {
        const cleaned = cleanCustomerRow(record);
        
        // Match existing customer
        let matched = null;
        if (cleaned.email) matched = emailMap.get(cleaned.email);
        if (!matched && cleaned.phone) matched = phoneMap.get(cleaned.phone);

        if (matched) {
          // Track updates for missing/null fields
          const updateData = {};
          if (matched.lastName === null && cleaned.lastName !== null) {
            updateData.lastName = cleaned.lastName;
            matched.lastName = cleaned.lastName; // Sync map
          }
          if (matched.email === null && cleaned.email !== null) {
            updateData.email = cleaned.email;
            matched.email = cleaned.email; // Sync map
          }
          if (matched.phone === null && cleaned.phone !== null) {
            updateData.phone = cleaned.phone;
            matched.phone = cleaned.phone; // Sync map
          }
          if (matched.gender === null && cleaned.gender !== null) {
            updateData.gender = cleaned.gender;
            matched.gender = cleaned.gender; // Sync map
          }
          if (matched.dateOfBirth === null && cleaned.dateOfBirth !== null) {
            updateData.dateOfBirth = cleaned.dateOfBirth;
            matched.dateOfBirth = cleaned.dateOfBirth; // Sync map
          }
          if (matched.externalId === null && cleaned.externalId !== null) {
            updateData.externalId = cleaned.externalId;
            matched.externalId = cleaned.externalId; // Sync map
          }

          if (Object.keys(updateData).length > 0) {
            updates.push({
              id: matched.id,
              data: updateData
            });
          }
        } else {
          // Create new customer representation
          const customerId = randomUUID();
          const customerObj = {
            id: customerId,
            workspaceId,
            firstName: cleaned.firstName,
            lastName: cleaned.lastName,
            email: cleaned.email,
            phone: cleaned.phone,
            gender: cleaned.gender,
            dateOfBirth: cleaned.dateOfBirth,
            externalId: cleaned.externalId
          };

          newCustomers.push(customerObj);

          // Add to in-memory maps for subsequent rows in same file
          if (cleaned.email) emailMap.set(cleaned.email, customerObj);
          if (cleaned.phone) phoneMap.set(cleaned.phone, customerObj);
        }

        successfulRows++;
      } catch (err) {
        failedRows++;
      }
      processedRows++;
    }

    // Persist changes in transaction
    await customerRepository.bulkWriteCustomers(newCustomers, updates);

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
      uploadedBy: userId,
      successfulRows,
      failedRows,
      duration
    }, 'Import Completed');

    return completedJob;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      workspaceId,
      importJobId: job.id,
      uploadedBy: userId,
      errorMessage: error.message,
      duration
    }, 'Import Failed');

    return repository.updateJob(job.id, {
      status: 'FAILED',
      errorMessage: error.message,
      completedAt: new Date()
    });
  }
}

/**
 * Handle order CSV imports.
 */
export async function importOrders(workspaceId, userId, file) {
  if (!file || !file.buffer) {
    throw new ImportError('No file uploaded or file is empty.');
  }

  const job = await repository.createJob({
    workspaceId,
    uploadedBy: userId,
    type: 'ORDER',
    fileName: file.originalname
  });

  const startTime = Date.now();
  logger.info({ workspaceId, importJobId: job.id, uploadedBy: userId }, 'Import Started');

  try {
    await repository.updateJob(job.id, { status: 'PROCESSING' });

    const csvText = file.buffer.toString('utf8');
    const records = parseCSV(csvText);
    const totalRows = records.length;

    let processedRows = 0;
    let successfulRows = 0;
    let failedRows = 0;

    // Fetch existing customers in workspace to link orders
    const existingCustomers = await customerRepository.findByWorkspace(workspaceId);
    
    // In-memory maps mapping email/phone to the customer ID
    const emailMap = new Map();
    const phoneMap = new Map();

    for (const c of existingCustomers) {
      if (c.email) emailMap.set(c.email.toLowerCase(), c.id);
      if (c.phone) phoneMap.set(c.phone, c.id);
    }

    // Map incoming externalOrderIds to check duplicates
    const externalOrderIds = records
      .map(r => (r.externalOrderId || r.external_order_id || '').trim())
      .filter(Boolean);

    // Fetch existing orders in workspace matching these IDs
    const existingOrders = await orderRepository.findByExternalIds(workspaceId, externalOrderIds);
    const existingOrderSet = new Set(existingOrders.map(o => o.externalOrderId).filter(Boolean));

    const ordersToCreate = [];

    for (const record of records) {
      try {
        const cleaned = cleanOrderRow(record);

        // Duplicate Check: if externalOrderId matches, ignore it
        if (cleaned.externalOrderId && existingOrderSet.has(cleaned.externalOrderId)) {
          // Ignore duplicates (processed but skipped/ignored, counted as success)
          successfulRows++;
          processedRows++;
          continue;
        }

        // Link Customer
        let customerId = null;
        if (cleaned.customerEmail) customerId = emailMap.get(cleaned.customerEmail);
        if (!customerId && cleaned.customerPhone) customerId = phoneMap.get(cleaned.customerPhone);

        if (!customerId) {
          throw new Error('No matching customer found in workspace to link this order.');
        }

        const orderObj = {
          id: randomUUID(),
          workspaceId,
          customerId,
          externalOrderId: cleaned.externalOrderId,
          amount: cleaned.amount,
          currency: cleaned.currency,
          purchaseDate: cleaned.purchaseDate
        };

        ordersToCreate.push(orderObj);

        // Add to ignored set to handle duplicates in the same CSV upload
        if (cleaned.externalOrderId) {
          existingOrderSet.add(cleaned.externalOrderId);
        }

        successfulRows++;
      } catch (err) {
        failedRows++;
      }
      processedRows++;
    }

    // Persist orders
    await orderRepository.bulkCreateOrders(ordersToCreate);

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
      uploadedBy: userId,
      successfulRows,
      failedRows,
      duration
    }, 'Import Completed');

    return completedJob;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      workspaceId,
      importJobId: job.id,
      uploadedBy: userId,
      errorMessage: error.message,
      duration
    }, 'Import Failed');

    return repository.updateJob(job.id, {
      status: 'FAILED',
      errorMessage: error.message,
      completedAt: new Date()
    });
  }
}

/**
 * Get import job history.
 */
export async function getWorkspaceImports(workspaceId) {
  return repository.listJobs(workspaceId);
}

/**
 * Get single import job details.
 */
export async function getImportDetails(workspaceId, importId) {
  const job = await repository.findById(importId);
  if (!job || job.workspaceId !== workspaceId) {
    throw new NotFoundError('Import job not found.');
  }
  return job;
}
