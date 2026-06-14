import prisma from '../config/database.js';
import { compileRulesToSql } from '../shared/query-builder/queryBuilder.js';
import logger from '../utils/logger.js';

function personalize(template, customer) {
  if (!template) return '';
  return template
    .replace(/\{\{firstName\}\}/g, customer.firstName || '')
    .replace(/\{\{lastName\}\}/g, customer.lastName || '')
    .replace(/\{\{city\}\}/g, customer.city || '')
    .replace(/\{\{email\}\}/g, customer.email || '');
}

/**
 * Executes a simulated dispatch of campaign messages to segment customers.
 * Personalizes copies for each recipient, saves deliveries to db, and returns logs.
 */
export async function sendCampaign(workspaceId, campaignId) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      segment: {
        include: {
          rules: true
        }
      }
    }
  });

  if (!campaign || campaign.workspaceId !== workspaceId) {
    throw new Error('Campaign not found.');
  }

  const deserializedRules = campaign.segment.rules.map(r => ({
    field: r.field,
    operator: r.operator,
    value: JSON.parse(r.value)
  }));

  // Find matching customer IDs
  const { sql, params } = compileRulesToSql(workspaceId, deserializedRules);
  const matchedRows = await prisma.$queryRawUnsafe(sql, ...params);
  const matchedCustomerIds = matchedRows.map(row => row.id);

  if (matchedCustomerIds.length === 0) {
    logger.info({ campaignId }, 'No customers matched target segment rules for campaign send.');
    // Set campaign metrics to zero
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        sentCount: 0,
        openRate: 0,
        clickRate: 0,
        conversionRate: 0
      }
    });
    return [];
  }

  // Load complete customer objects
  const customers = await prisma.customer.findMany({
    where: {
      id: { in: matchedCustomerIds }
    }
  });

  const statusProbabilities = {
    EMAIL: { DELIVERED: 0.85, OPENED: 0.60, CLICKED: 0.15, CONVERTED: 0.05, FAILED: 0.05 },
    SMS: { DELIVERED: 0.90, OPENED: 0.80, CLICKED: 0.10, CONVERTED: 0.02, FAILED: 0.05 },
    WHATSAPP: { DELIVERED: 0.95, OPENED: 0.90, CLICKED: 0.25, CONVERTED: 0.08, FAILED: 0.02 }
  };

  const channelProb = statusProbabilities[campaign.channel] || statusProbabilities.EMAIL;

  const deliveries = [];
  let sentCount = customers.length;
  let deliveredCount = 0;
  let openedCount = 0;
  let clickedCount = 0;
  let convertedCount = 0;
  let failedCount = 0;

  for (const customer of customers) {
    // Determine a random status based on conversion probability logic
    const rand = Math.random();
    let status = 'SENT';
    
    if (rand < channelProb.FAILED) {
      status = 'FAILED';
      failedCount++;
    } else if (rand < channelProb.FAILED + channelProb.CONVERTED) {
      status = 'CONVERTED';
      convertedCount++;
      clickedCount++;
      openedCount++;
      deliveredCount++;
    } else if (rand < channelProb.FAILED + channelProb.CONVERTED + channelProb.CLICKED) {
      status = 'CLICKED';
      clickedCount++;
      openedCount++;
      deliveredCount++;
    } else if (rand < channelProb.FAILED + channelProb.CONVERTED + channelProb.CLICKED + channelProb.OPENED) {
      status = 'OPENED';
      openedCount++;
      deliveredCount++;
    } else {
      status = 'DELIVERED';
      deliveredCount++;
    }

    const messageSubject = campaign.messageSubject ? personalize(campaign.messageSubject, customer) : null;
    const messageBody = personalize(campaign.messageBody, customer);

    deliveries.push({
      workspaceId,
      campaignId,
      customerId: customer.id,
      status,
      messageSubject,
      messageBody
    });
  }

  // Batch insert into db
  await prisma.campaignDelivery.createMany({
    data: deliveries
  });

  // Calculate rate percentages
  const openRate = sentCount > 0 ? parseFloat(((openedCount / sentCount) * 100).toFixed(2)) : 0;
  const clickRate = sentCount > 0 ? parseFloat(((clickedCount / sentCount) * 100).toFixed(2)) : 0;
  const conversionRate = sentCount > 0 ? parseFloat(((convertedCount / sentCount) * 100).toFixed(2)) : 0;

  // Update Campaign with these exact calculated stats
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount,
      openRate,
      clickRate,
      conversionRate
    }
  });

  return deliveries.map(d => {
    const customer = customers.find(c => c.id === d.customerId);
    return {
      ...d,
      customerName: customer ? `${customer.firstName} ${customer.lastName || ''}`.trim() : 'Unknown Customer',
      customerEmail: customer ? customer.email : null,
      customerPhone: customer ? customer.phone : null
    };
  });
}
