# System Architecture — Enterprise Authentication Foundation

This document details the architectural specifications, component boundaries, and security patterns implemented in the XENO Authentication and User Management subsystem.

---

## 1. Directory Blueprint & Layered Architecture

The project is structured under a strict Layered Architecture to enforce separation of concerns, improve testability, and decouple the HTTP layer from business transactions and database access.

```
src/
├── app.js                   # Express application configuration and middleware registration
├── server.js                # Server entry point, configuration verification, and graceful shutdown handles
├── config/                  # Configuration loaders and database client instantiations
│   ├── env.js               # Strict environment variables loader using Zod parsing
│   └── database.js          # Prisma Client singleton
├── controllers/             # HTTP Controllers (express request mapping and client auditing)
│   └── auth.controller.js
├── services/                # Business logic services (transactions, token generation, email alerts)
│   ├── auth.service.js
│   └── email.service.js
├── repositories/            # Database access layer (Prisma query encapsulation)
│   ├── user.repository.js
│   ├── session.repository.js
│   ├── token.repository.js
│   └── audit-log.repository.js
├── routes/                  # API routes routing declarations
│   └── auth.routes.js
├── middlewares/             # Express middlewares (security guards, rate limiters, error captures)
│   ├── auth.middleware.js
│   ├── error.middleware.js
│   ├── rate-limit.middleware.js
│   └── validation.middleware.js
├── schemas/                 # Zod validation schema templates
│   └── auth.schema.js
├── utils/                   # Shared utility logic
│   ├── crypto.js            # Bcrypt, SHA-256 hashing, timing-safe compares, random generator
│   ├── errors.js            # Standard AppError classes
│   └── logger.js            # Pino logging configuration
└── lib/                     # Third-party integrations
    └── nodemailer.js        # SMTP email client instantiation
```

### Separation of Concerns (SoC)

| Layer | Responsibility | Inputs / Outputs |
| :--- | :--- | :--- |
| **Routing** | Directs HTTP verbs and routes to validation chains and controllers. | Request URL $\rightarrow$ Controller |
| **Middlewares** | Intercepts requests for rate-limiting, JWT parsing, role authorization, and validation. | Request $\rightarrow$ Sanitized Request |
| **Controllers** | Extracts HTTP properties (body, headers, query, client IP, User-Agent) and passes them to services. Handles HTTP response status codes. | HTTP Req $\rightarrow$ JSON Response |
| **Services** | Core transactional business actions. Interacts with repositories, generates JWTs, and fires background emails. | DTO Object $\rightarrow$ Domain Models |
| **Repositories** | Prisma query wrappers mapping PostgreSQL records to JS structures. Encapsulates soft-delete and relation joins. | DTO/IDs $\rightarrow$ DB Record |
| **Prisma DB** | Relational mapping, schema synchronization, and database index configurations. | Prisma client $\rightarrow$ PostgreSQL |

---

## 2. Database Design & Entity Relations

The PostgreSQL database is managed via Prisma ORM, utilizing structural enums and explicit relation cascade behaviors.

```mermaid
erDiagram
    users {
        uuid id PK
        string email UK
        string passwordHash
        string firstName
        string lastName
        string avatarUrl
        boolean isEmailVerified
        UserStatus status
        Role role
        datetime deletedAt
        datetime createdAt
        datetime updatedAt
        string refreshTokenHash UK
        datetime sessionExpiry
        string emailVerificationToken UK
        datetime emailVerificationExpiry
        string passwordResetToken UK
        datetime passwordResetExpiry
        datetime lastLoginAt
        string lastLoginIp
    }
```

### Models Specification

#### User
- **UUID Keys**: Auto-generated Version 4 UUIDs.
- **Case-Insensitive Uniqueness**: Handled by lowercasing the email at Zod validation and service boundaries before writing to PostgreSQL.
- **Soft Delete Support**: Flagged via the `deletedAt` DateTime timestamp. If populated, the record is excluded from all search queries, and status is marked `DELETED`.

#### Session & Token Fields
- **Refresh Token Isolation**: Only the SHA-256 hash of the refresh token is stored on the `refreshTokenHash` field. In-transit refresh tokens never exist in plaintext within the database.
- **Revocation State**: A session is revoked by setting `refreshTokenHash` and `sessionExpiry` to `null`.
- **Single Session Limitation**: A user can only be logged into one device at a time.
- **Verification & Reset Tokens**: Managed directly via `emailVerificationToken` and `passwordResetToken` fields, validated against their respective expiry columns.

---

## 3. Cryptography & Security Engineering

### Hashing Strategies
1. **Passwords**: Hashed using `bcrypt` with a cost factor of **12 rounds**, maintaining optimal resistance against brute-force attacks while fitting server responsiveness limits (<150ms processing time).
2. **Tokens**: High-entropy tokens (Refresh, Email, Reset) are generated using 32 bytes of secure random bytes (`crypto.randomBytes(32).toString('hex')`). They are hashed before database writes using `SHA-256` (`crypto.createHash('sha256')`).

### JWT Specifications
The platform issues dual JWT tokens (Access and Refresh) signed using standard HMAC SHA-256.

```
Access JWT (Short-Lived: 15 minutes)
└── Payload
    ├── sub: UUID (User ID)
    ├── email: string
    ├── role: USER | ADMIN | SUPER_ADMIN
    ├── iss: 'xeno-auth-issuer'
    └── aud: 'xeno-saas-audience'

Refresh JWT (Long-Lived: 7 days)
└── Payload
    ├── sub: UUID (User ID)
    ├── jti: UUID (Unique Token ID to prevent same-second generation collisions)
    ├── iss: 'xeno-auth-issuer'
    └── aud: 'xeno-saas-audience'
```

### Refresh Token Rotation (RTR) & Replay Prevention
To mitigate token theft, XENO enforces strict Refresh Token Rotation (RTR).

1. **Successful Rotation**:
   - The user requests a token rotation by sending their current JWT Refresh Token.
   - The server decodes the token, extracts the `sub` (userId), and fetches the user from the database.
   - The incoming token's SHA-256 hash is compared using `timingSafeCompare` with the database's stored `refreshTokenHash`.
   - Upon verification, a new JWT refresh token (with a new `jti`) is issued, and its hash is persisted in the User row, overwriting the old one.

2. **Replay Attack / Compromise Detection**:
   - If a client attempts to rotate a session using a hash that does NOT match the active `refreshTokenHash` (meaning they used an older, replaced refresh token), this indicates a replay attack.
   - The server immediately flags a `SUSPICIOUS_REPLAY_ATTACK` security breach.
   - The server revokes the active session by nullifying `refreshTokenHash` and `sessionExpiry`. The user is logged out immediately.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client/Attacker
    participant Server as Express Server
    participant DB as PostgreSQL

    Client->>Server: POST /auth/refresh (Old JWT Refresh Token)
    Server->>Server: Verify JWT signature & Extract incomingHash
    Server->>DB: Fetch User by userId
    DB-->>Server: Return User (with new active refreshTokenHash)
    Note over Server: Security Breach Detected: Hash Mismatch (Replay Attack)!
    Server->>DB: Transaction: Nullify refreshTokenHash & sessionExpiry
    Server->>Server: Log 'SUSPICIOUS_REPLAY_ATTACK'
    DB-->>Server: Commit Transaction
    Server->>Client: Return 401 Unauthorized (Session Revoked)
```

---

## 4. Error Handling (RFC 7807 Compliance)

Every application response returning a `4xx` or `5xx` status code conforms to the **RFC 7807 (Problem Details for HTTP APIs)** specification, providing uniform machine-readable JSON bodies.

### Header Specification
Responses are served with the header: `Content-Type: application/problem+json`.

### Payload Model
```json
{
  "type": "about:blank",
  "title": "Bad Request / Validation Error",
  "status": 400,
  "detail": "Request validation failed.",
  "instance": "/auth/signup",
  "errors": [
    {
      "field": "password",
      "message": "Password must contain at least one special character."
    }
  ]
}
```

---

## 5. Observability & Graceful Shutdown

### Pino Logger Configuration
- **Redaction**: System blocks logging of `password`, `passwordHash`, `token`, `refreshToken`, `accessToken`, `secret` (supports nested objects like `body.password`).
- **Log Events**:
  - `USER_SIGNUP`: Tracked with userId and email.
  - `USER_LOGIN`: Tracks IP, User-Agent, and sessionId.
  - `SUSPICIOUS_REPLAY_ATTACK`: Logs severity `error` containing sessionId and IP coordinates.
  - `EMAIL_DISPATCH`: Logs success/failure states of Nodemailer SMTP requests.

### Graceful Shutdown
To prevent request dropouts and DB record corruptions during application deployments or restarts:
1. **SIGINT/SIGTERM Traps**: Intercepted by `server.js`.
2. **HTTP socket closure**: Express stops listening and stops accepting incoming connections.
3. **Database separation**: `prisma.$disconnect()` is invoked only after in-flight requests complete processing.
4. **Kill Switch Safeguard**: 10-second timeout forcefully exits the Node process if connections hang.
