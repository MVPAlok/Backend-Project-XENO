# Workspace Management

This document details the Multi-Tenant Workspace System, representing Phase 2 of the XENO backend architecture.

## Overview
Workspaces are the core tenant isolation boundary of XENO. Each workspace represents an independent brand or business entity (e.g., "Nike India", "Starbucks India"). All future models—customers, campaigns, analytics, and AI—will map directly to a workspace to ensure multi-tenant security and brand-data isolation.

---

## Architectural Decisions

1. **Modular Architecture**: All workspace logic is encapsulated within `src/modules/workspace/`. This makes it distinct from the layered auth modules, keeping all workspace controller, validation, service, repository, middleware, and routing concerns together.
2. **Atomic Transactional Creations**: Creating a workspace automatically creates a corresponding `WorkspaceMember` assignment with the `OWNER` role using a database transaction.
3. **PTY Bypassed Migrations**: During migrations, custom setups ensure migrations run safely in non-interactive CI/CD and runner environments using PTY execution wrappers.

---

## Database Schema

```prisma
enum WorkspaceRole {
  OWNER
  ADMIN
  MEMBER
}

model Workspace {
  id          String            @id @default(uuid()) @db.Uuid
  name        String
  slug        String            @unique
  description String?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  memberships WorkspaceMember[]

  @@map("workspaces")
}

model WorkspaceMember {
  id          String        @id @default(uuid()) @db.Uuid
  userId      String        @db.Uuid
  workspaceId String        @db.Uuid
  role        WorkspaceRole
  joinedAt    DateTime      @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([userId, workspaceId])
  @@map("workspace_members")
}
```

### Constraints
* Unique slug constraint on the `workspaces` table.
* Compound unique constraint on `(userId, workspaceId)` on the `workspace_members` table prevents duplicate memberships.

---

## Slug Generation Strategy
A reusable utility is created at `src/shared/utils/slug.js`.
* Base slugs are created by converting to lowercase, removing non-alphanumeric characters, replacing spaces with dashes, and trimming duplicate dashes.
* If a conflict is found in the database, the utility runs an incrementing check loop to append `-2`, `-3`, etc., until finding a unique option.

---

## Authorization Flow

The `requireWorkspaceMember` middleware handles resource authorization:
1. Validates the `workspaceId` UUID structure.
2. Pulls `req.user.id` from the JWT validator.
3. Queries the database to verify the workspace exists. If not, returns `404 Not Found`.
4. Checks if the user has an active membership record for that workspace. If not, logs a warning and returns `403 Forbidden`.
5. Attaches the membership record to `req.membership`.

---

## API Specifications & Contract Examples

### 1. Create Workspace
* **Method**: `POST`
* **Path**: `/workspaces`
* **Headers**: `Authorization: Bearer <jwt-token>`
* **Request Payload**:
```json
{
  "name": "Nike India",
  "description": "Sports Wear"
}
```
* **Success Response (201 Created)**:
```json
{
  "id": "e6de27a4-d9bc-4df1-85b2-32a51241512f",
  "name": "Nike India",
  "slug": "nike-india",
  "description": "Sports Wear",
  "createdAt": "2026-06-13T10:00:00.000Z",
  "updatedAt": "2026-06-13T10:00:00.000Z",
  "role": "OWNER"
}
```

### 2. List Workspaces
* **Method**: `GET`
* **Path**: `/workspaces`
* **Headers**: `Authorization: Bearer <jwt-token>`
* **Success Response (200 OK)**:
```json
[
  {
    "id": "e6de27a4-d9bc-4df1-85b2-32a51241512f",
    "name": "Nike India",
    "slug": "nike-india",
    "role": "OWNER",
    "createdAt": "2026-06-13T10:00:00.000Z"
  }
]
```

### 3. Retrieve Workspace details
* **Method**: `GET`
* **Path**: `/workspaces/:workspaceId`
* **Headers**: `Authorization: Bearer <jwt-token>`
* **Success Response (200 OK)**:
```json
{
  "id": "e6de27a4-d9bc-4df1-85b2-32a51241512f",
  "name": "Nike India",
  "slug": "nike-india",
  "description": "Sports Wear",
  "createdAt": "2026-06-13T10:00:00.000Z",
  "updatedAt": "2026-06-13T10:00:00.000Z"
}
```

### Error Scenarios
* **400 Bad Request (Validation failure)**:
```json
{
  "type": "about:blank",
  "title": "Bad Request / Validation Error",
  "status": 400,
  "detail": "Request validation failed.",
  "instance": "/workspaces",
  "errors": [
    {
      "field": "name",
      "message": "Workspace name must be at least 3 characters long"
    }
  ]
}
```
* **403 Forbidden (Not a member)**:
```json
{
  "type": "about:blank",
  "title": "Forbidden",
  "status": 403,
  "detail": "Access denied to this workspace",
  "instance": "/workspaces/e6de27a4-d9bc-4df1-85b2-32a51241512f"
}
```
* **404 Not Found**:
```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Workspace not found",
  "instance": "/workspaces/00000000-0000-0000-0000-000000000000"
}
```

---

## Future Extensibility Notes
* **Role hierarchy**: In subsequent phases, middleware can be updated to accept parameters like `requireWorkspaceMember('ADMIN')` to filter routes by roles.
* **Cascading deletions**: All relation fields are configured with `onDelete: Cascade` to ensure that removing a user or workspace safely updates the membership lists.
