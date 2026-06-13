# Customer Domain & Ingestion Strategy

This document describes the Customer model, validation rules, normalization rules, and conflict/duplicate resolution strategy implemented in XENO.

---

## 1. Database Schema

```prisma
model Customer {
  id          String    @id @default(uuid()) @db.Uuid
  workspaceId String    @db.Uuid
  externalId  String?
  firstName   String
  lastName    String?
  email       String?
  phone       String?
  gender      String?
  dateOfBirth DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  orders    Order[]

  @@unique([workspaceId, email])
  @@unique([workspaceId, phone])
  @@index([workspaceId])
  @@index([email])
  @@index([phone])
  @@map("customers")
}
```

### Tenant Isolation & Scoped Uniqueness:
* **Workspace Boundaries**: Every customer belongs to exactly one `workspaceId`. Customers in Workspace A are completely isolated from Workspace B.
* **Workspace-Scoped Uniqueness**: Emails and phones must be unique *within the same workspace* (`@@unique([workspaceId, email])` and `@@unique([workspaceId, phone])`). The same email or phone can exist in two different workspaces representing different brands.

---

## 2. Validation & Normalization Rules

All customer records undergo strict cleaning and normalization before persistence:
- **First Name**: Required. Must be a non-empty string. Trimmed.
- **Last Name**: Optional. Trimmed.
- **Email**: Optional. Normalized to lowercase and trimmed. Invalid email structures are rejected (e.g. missing `@` or domain).
- **Phone**: Optional. Normalized by stripping non-digit characters. Must contain at least 7 digits.
- **Gender**: Optional. Standardized to uppercase: `MALE`, `FEMALE`, or `OTHER`. Supporting abbreviations.
- **Date of Birth**: Optional. Parsed into an ISO DateTime object.

---

## 3. Conflict & Duplicate Resolution Strategies

When importing sales datasets, customer conflicts (matching email or phone already exists in the database) are resolved at the **Confirmation** phase using three strategies:

### 1. `KEEP_EXISTING` (Default Strategy)
* **Heuristic**: Database record wins.
* **Behavior**: If the database customer has a `null` or empty field but the CSV row contains a value, that field is filled in. Existing non-null database fields are never overwritten.

### 2. `UPDATE_EXISTING`
* **Heuristic**: Incoming CSV record wins.
* **Behavior**: Overwrites existing database fields with incoming values.

### 3. `SKIP`
* **Heuristic**: Ignore conflict.
* **Behavior**: The row is skipped. No database updates are applied to the customer, and any associated orders in that row are also skipped.

---

## 4. Bulk Write Operations
* **In-Memory Cache**: To prevent N+1 queries, existing workspace customers are cached in-memory.
* **Database Transaction**: Saves are performed inside a Prisma `$transaction`, dividing records into batch `createMany` inserts and transactional `update` commands.
