import { ValidationError } from '../../utils/errors.js';

const ALLOWED_FIELDS = new Set([
  'totalSpend',
  'lastPurchaseDays',
  'purchaseFrequency',
  'city',
  'category',
  'orderCount',
  'averageOrderValue',
  'firstPurchaseDays',
  'discountUsage'
]);

const ALLOWED_OPERATORS = new Set(['>', '<', '>=', '<=', '=', 'IN']);

/**
 * Compiles validated segment rules into parameter-bound SQL statements.
 * Prevents SQL Injection by validating operators, fields, and using parameters.
 */
export function compileRulesToSql(workspaceId, rules, now = new Date()) {
  const selectQuery = `
    SELECT c.id, 
           MAX(c."firstName" || ' ' || COALESCE(c."lastName", '')) as name,
           MAX(c.city) as city,
           COALESCE(SUM(o.amount), 0) as "totalSpend",
           COUNT(o.id) as "orderCount",
           MAX(o."purchaseDate") as "lastPurchaseDate"
    FROM customers c
    LEFT JOIN orders o ON o."customerId" = c.id
    WHERE c."workspaceId" = $1::uuid AND c."deletedAt" IS NULL
    GROUP BY c.id
  `;

  const havingClauses = [];
  const params = [workspaceId, now];

  const addParam = (val) => {
    params.push(val);
    return `$${params.length}`;
  };

  for (const rule of rules) {
    const { field, operator, value } = rule;

    // Strict validation
    if (!ALLOWED_FIELDS.has(field)) {
      throw new ValidationError(`Unsupported field: ${field}`);
    }
    if (!ALLOWED_OPERATORS.has(operator)) {
      throw new ValidationError(`Unsupported operator: ${operator}`);
    }

    let paramPlaceholder;
    if (operator === 'IN') {
      const vals = Array.isArray(value) ? value : [value];
      if (vals.length === 0) {
        throw new ValidationError('Operator IN requires a non-empty array of values.');
      }
      const placeholders = vals.map(v => addParam(v)).join(', ');
      paramPlaceholder = `(${placeholders})`;
    } else {
      paramPlaceholder = addParam(value);
    }

    if (field === 'totalSpend') {
      havingClauses.push(`COALESCE(SUM(o.amount), 0) ${operator} (${paramPlaceholder})::numeric`);
    } else if (field === 'orderCount' || field === 'purchaseFrequency') {
      havingClauses.push(`COUNT(o.id) ${operator} (${paramPlaceholder})::integer`);
    } else if (field === 'averageOrderValue') {
      havingClauses.push(`COALESCE(AVG(o.amount), 0) ${operator} (${paramPlaceholder})::numeric`);
    } else if (field === 'city') {
      if (operator === 'IN') {
        havingClauses.push(`LOWER(MAX(c.city)) IN ${paramPlaceholder}`);
      } else {
        havingClauses.push(`LOWER(MAX(c.city)) ${operator} LOWER(${paramPlaceholder})`);
      }
    } else if (field === 'category') {
      if (operator === 'IN') {
        havingClauses.push(`SUM(CASE WHEN LOWER(o.category) IN ${paramPlaceholder} THEN 1 ELSE 0 END) > 0`);
      } else {
        havingClauses.push(`SUM(CASE WHEN LOWER(o.category) = LOWER(${paramPlaceholder}) THEN 1 ELSE 0 END) > 0`);
      }
    } else if (field === 'discountUsage') {
      const valBool = value === true || value === 'true' || value === '1' || value === 1;
      havingClauses.push(`SUM(CASE WHEN o."discountUsage" = ${addParam(valBool)} THEN 1 ELSE 0 END) ${valBool ? '>' : '='} 0`);
    } else if (field === 'lastPurchaseDays') {
      havingClauses.push(`(EXTRACT(EPOCH FROM ($2::timestamp - MAX(o."purchaseDate")::timestamp)) / 86400) ${operator} (${paramPlaceholder})::numeric`);
    } else if (field === 'firstPurchaseDays') {
      havingClauses.push(`(EXTRACT(EPOCH FROM ($2::timestamp - MIN(o."purchaseDate")::timestamp)) / 86400) ${operator} (${paramPlaceholder})::numeric`);
    }
  }

  const havingSql = havingClauses.length > 0 ? `HAVING ${havingClauses.join(' AND ')}` : '';
  const sql = `${selectQuery} ${havingSql}`;

  return { sql, params };
}
export default compileRulesToSql;
