# Customer Domain

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

### Key Schema Level Guarantees:
* **Multi-Tenant Isolation**: Every customer belongs to exactly one `workspaceId`.
* **Workspace-Scoped Uniqueness**: Emails and phones must be unique *within the same workspace* (`@@unique([workspaceId, email])` and `@@unique([workspaceId, phone])`). The same email or phone can exist in two different workspaces representing different brands.

---

## 2. Validation & Normalization Rules

To ensure data cleanliness in the CRM, all customer records undergo strict cleaning and normalization before persistence:

| Field | CSV Column Header | Validation & Cleaning Rule |
| :--- | :--- | :--- |
| `firstName` | `first_name` or `firstName` | **Required**. Must be a non-empty string. Trimmed. |
| `lastName` | `last_name` or `lastName` | Optional. Trimmed. |
| `email` | `email` | Optional. Normalized to lowercase and trimmed. Invalid email structures are rejected (e.g. missing `@` or domain). |
| `phone` | `phone` | Optional. Normalized using regex to strip any non-digit characters except a leading `+` symbol. |
| `gender` | `gender` | Optional. Standardized to uppercase: `MALE`, `FEMALE`, or `OTHER`. Any other string defaults to `null`. |
| `dateOfBirth` | `date_of_birth` or `dob` | Optional. Parsed into an ISO DateTime object. Supports YYYY-MM-DD or full ISO date formats. Invalid dates default to `null`. |
| `externalId` | `external_id` or `id` | Optional. External identifier from legacy CRM or Shopify/Magento. |

---

## 3. Duplicate & Conflict Resolution Strategy

When importing a CSV dataset, duplicate customers can exist:
1. **In-Memory Duplicates**: Multiple rows in the same CSV file sharing the same email or phone number.
2. **Database Duplicates**: A row in the CSV matching an email or phone number of a customer who already exists in the database for the given workspace.

To handle these conflicts gracefully without failing the entire import job:

### Rule 1: First-Record Win (In-Memory)
During CSV parsing, if multiple rows in the same file share the same email or phone:
* The **first row** encountered is marked for processing/insertion.
* Subsequent rows with conflicting emails/phones are treated as failures and logged in the import details.

### Rule 2: Partial Field Merge (Database Upsert)
If a CSV customer matches an existing customer in the database by either email or phone:
1. **Never overwrite existing data**: If the database customer already has a value in a field (e.g. `lastName` is "Smith"), the import will not modify it.
2. **Fill in the blanks**: If the database customer has a `null` or empty field, but the CSV row contains a valid value for that field (e.g. database `gender` is `null` and CSV `gender` is `MALE`), the field is updated.
3. **Link Verification**: The record retains its original `id` to keep existing orders intact.

### Database Batch Operations
To avoid N+1 queries during bulk imports:
* **In-Memory Map**: The service constructs a dictionary/map of all existing customers in the workspace matched by email or phone.
* **Bulk Write Transaction**: Splits customers into groups to insert new customers in batch (`createMany`) and updates existing customers in sequential promises wrapped in a single database transaction.
