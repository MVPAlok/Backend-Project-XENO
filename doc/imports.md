# Import Infrastructure & Pipeline

This document details the CSV Import Infrastructure and Pipeline, representing Phase 3 of the XENO backend architecture.

---

## 1. Overview
The import system allows workspace users to upload structured customer and order data in CSV format to quickly bootstrap their workspace tenants. 
This ingestion foundation is designed to validate, sanitize, and persist files up to **10MB** sequentially (synchronously) in the current iteration, with a clear path to asynchronous background worker queues.

---

## 2. Ingestion Flow & Lifecycle

The lifecycle of an import operation proceeds as follows:

```mermaid
sequenceDiagram
    autonumber
    actor User as Workspace Member
    participant Controller as Import Controller
    participant Service as Import Service
    participant CSV as CSV Parser
    participant CustService as Customer Service
    participant OrdService as Order Service
    participant DB as PostgreSQL (Prisma)

    User->>Controller: POST /workspaces/:workspaceId/imports
    Note over Controller: Validates workspace member,<br/>Checks multer file (CSV only, <= 10MB)
    Controller->>Service: processImport(workspaceId, userId, fileDetails, type)
    
    Service->>DB: Create ImportJob (Status: PROCESSING)
    DB-->>Service: ImportJob record
    
    Service->>CSV: parse(buffer)
    CSV-->>Service: Raw parsed JSON rows
    
    alt type == "customers"
        Service->>CustService: bulkIngestCustomers(workspaceId, parsedRows)
        Note over CustService: Cleans emails/phones, removes invalid rows,<br/>performs in-memory conflict resolution,<br/>bulk-upserts records.
        CustService-->>Service: { successfulRows, failedRows, errors }
    else type == "orders"
        Service->>OrdService: bulkIngestOrders(workspaceId, parsedRows)
        Note over OrdService: Resolves customer IDs via emails/phones,<br/>ignores or records rows with missing customer links,<br/>bulk-inserts orders.
        OrdService-->>Service: { successfulRows, failedRows, errors }
    end

    Service->>DB: Update ImportJob (Status: COMPLETED / FAILED, metrics)
    DB-->>Service: Updated ImportJob record
    
    Service-->>Controller: Formatted Import Summary
    Controller-->>User: 200 OK / 201 Created (Ingestion metrics & summary)
```

---

## 3. Database Schema

```prisma
enum ImportStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

model ImportJob {
  id             String       @id @default(uuid()) @db.Uuid
  workspaceId    String       @db.Uuid
  uploadedBy     String       @db.Uuid
  type           String       // "customers" | "orders"
  fileName       String
  status         ImportStatus @default(PENDING)
  totalRows      Int          @default(0)
  processedRows  Int          @default(0)
  successfulRows Int          @default(0)
  failedRows     Int          @default(0)
  errorMessage   String?
  createdAt      DateTime     @default(now())
  completedAt    DateTime?

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [uploadedBy], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@index([uploadedBy])
  @@index([status])
  @@index([createdAt])
  @@map("import_jobs")
}
```

---

## 4. Architectural Tradeoffs: Synchronous vs. Asynchronous Queues

Currently, imports are processed **synchronously** within the HTTP request cycle. This choice was made for:
1. **Simplicity and Direct Feedback**: Users get instant confirmation and verification summaries in the HTTP response.
2. **Minimal Infrastructure Footprint**: Eliminates the immediate need for Redis and background worker instances for small-scale operations.

### Production Scalability Constraints (Why Sync is a Tradeoff)
* **Request Timeout Limits**: Large files (>5MB or near the 10MB limit) can hit API gateway (e.g. Nginx, AWS ALB) or Express request timeout thresholds (typically 30s - 120s).
* **Event Loop Blocking**: CSV parsing and validation are CPU-intensive operations. Running large parse tasks blocking the Node.js event loop degrades API responsiveness for all other users.
* **Memory Spikes**: Buffering the entire CSV file and loading massive arrays of objects into memory simultaneously risks crashing the container due to Out-Of-Memory (OOM) limits.

### Path to Asynchronous Scaling (Proposed Queue Design)
For production-grade scalability, XENO will transition to an **asynchronous queue architecture** using **BullMQ** or **Bee-Queue** backed by **Redis**:

```mermaid
graph TD
    User[Workspace User] -->|1. Uploads CSV| API[API Gateway / Express Server]
    API -->|2. Saves file to S3/Cloud Storage| S3[Storage Bucket]
    API -->|3. Creates ImportJob PENDING| DB[(PostgreSQL)]
    API -->|4. Enqueues job with file URI| Redis[(Redis Queue)]
    API -->|5. Immediate Response 202 Accepted| User
    
    subgraph Worker Pool
        Worker1[Background Worker 1]
        Worker2[Background Worker 2]
    end

    Redis -->|Pulls Job| Worker1
    Worker1 -->|6. Streams CSV file| S3
    Worker1 -->|7. Updates Job status to PROCESSING| DB
    Worker1 -->|8. Batch processes & upserts| DB
    Worker1 -->|9. Marks Job COMPLETED/FAILED| DB
    Worker1 -->|10. Triggers WebSocket Notification| WS[Websocket Server]
    WS -.->|11. UI Toast Alert| User
```

#### Key Changes in the Async Pipeline:
1. **Stream-based Processing**: Instead of reading the entire file into memory, use Node.js streams (`csv-parse` stream API) to read and process the file in batches (e.g., 500 records at a time).
2. **Dedicated Workers**: Offload processing to a separate cluster of CPU-optimized Docker containers running worker processes.
3. **Optimistic HTTP Accepted (202)**: Instantly return an import job ID with a status of `PENDING` so the client UI can poll the job or wait for a WebSocket notification.
