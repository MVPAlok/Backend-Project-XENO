# Order Domain & Extraction Strategy

This document describes the Order model, validation rules, customer linking mechanics, and deduplication strategies implemented in XENO.

---

## 1. Database Schema

```prisma
model Order {
  id              String   @id @default(uuid()) @db.Uuid
  workspaceId     String   @db.Uuid
  customerId      String   @db.Uuid
  externalOrderId String?
  amount          Decimal  @db.Decimal(10, 2)
  currency        String   @default("INR")
  purchaseDate    DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  customer  Customer  @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, externalOrderId])
  @@index([workspaceId])
  @@index([customerId])
  @@index([purchaseDate])
  @@map("orders")
}
```

### Schema Guarantees:
* **Workspace Boundary**: Every order belongs to a `workspaceId` and is fully isolated.
* **Workspace Order Uniqueness**: The `externalOrderId` must be unique within the workspace (`@@unique([workspaceId, externalOrderId])`).
* **Decimal Precision**: Order amounts are stored as exact decimal numbers (`Decimal(10, 2)`) to prevent floating-point rounding errors.

---

## 2. Validation & Normalization Rules

All order records undergo strict cleaning and normalization before persistence:
- **Order ID**: Optional. Trimmed.
- **Amount**: Required when Order ID is present. Must parse to a positive number. Formatted to two decimal places.
- **Currency**: Optional. Defaults to `INR` if empty. Standardized to 3-character uppercase.
- **Purchase Date**: Required when Order ID is present. Must parse into a valid ISO Date.

---

## 3. Customer Linking Logic

An order must be linked to a customer. When processing the single dataset:
1. **Dynamic Customer Resolution**: For each row containing order details, the system identifies the customer either from the existing database records (by email or phone) or from the new customer records created from that same row.
2. **Transactional Insertion**: Once the customer ID is resolved, the order is created with the reference `customerId = customer.id`.

---

## 4. Conflict & Deduplication Strategies

When an order with a matching `externalOrderId` already exists in the database:
- **`KEEP_EXISTING`**: The existing database order is preserved (database wins). No changes are made to the order.
- **`UPDATE_EXISTING`**: The incoming CSV order details (amount, currency, purchaseDate, customerId) overwrite the database order fields.
- **`SKIP`**: The order update is ignored (skipped).
