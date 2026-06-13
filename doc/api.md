# API Reference & Contracts — Enterprise Authentication

This document specifies the request headers, payload validation constraints, response headers, HTTP status codes, and JSON bodies for all XENO Authentication API endpoints.

---

## Content-Type Handlers
- **Standard Request Body**: `application/json`
- **Standard Response Body**: `application/json`
- **Error Response Body**: `application/problem+json` (RFC 7807)

---

## 1. Sign Up User

Creates a new user profile in the database and triggers a verification email.

- **Method**: `POST`
- **Path**: `/auth/signup`
- **Authentication**: `Public` (Rate-limited: Max 5 requests/hour per IP)

### Request Payload Fields
| Name | Type | Rules / Constraints |
| :--- | :--- | :--- |
| `email` | String | Valid email address format, lowercase normalized, trimmed. |
| `password` | String | Min 8, max 100 characters. Requires $\ge 1$ lowercase, $\ge 1$ uppercase, $\ge 1$ number, $\ge 1$ special character. |
| `firstName` | String | Trimmed, min 1, max 50 characters. |
| `lastName` | String | Trimmed, min 1, max 50 characters. |
| `avatarUrl` | String | Optional. Must be a valid URL format. |

#### Example Request
```http
POST /auth/signup HTTP/1.1
Host: api.xeno.com
Content-Type: application/json

{
  "email": "architect@xeno.com",
  "password": "Password123!",
  "firstName": "Principal",
  "lastName": "Architect",
  "avatarUrl": "https://avatars.xeno.com/architect.png"
}
```

### Response Specs

#### Success Response
- **Status**: `201 Created`
- **Body**:
```json
{
  "id": "a67e42d2-8b43-4a11-bc66-3d234a921d7b",
  "email": "architect@xeno.com",
  "firstName": "Principal",
  "lastName": "Architect",
  "avatarUrl": "https://avatars.xeno.com/architect.png",
  "role": "USER",
  "isEmailVerified": false,
  "status": "ACTIVE",
  "createdAt": "2026-06-11T06:00:00.000Z",
  "updatedAt": "2026-06-11T06:00:00.000Z"
}
```

#### Error Response: Validation Fail
- **Status**: `400 Bad Request`
- **Body**:
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

#### Error Response: Email Conflict
- **Status**: `409 Conflict`
- **Body**:
```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "An account with this email address already exists.",
  "instance": "/auth/signup"
}
```

---

## 2. Verify Email

Consumes a verification token to activate/verify a user's email address.

- **Method**: `GET`
- **Path**: `/auth/verify-email`
- **Authentication**: `Public` (Rate-limited: Max 5 requests/hour per IP)
- **Query Parameters**:
  - `token` (String, required): The raw verification hex token sent via email.

#### Example Request
```http
GET /auth/verify-email?token=ab87f9c2d1b74898c081e7f9a8a72b8d HTTP/1.1
Host: api.xeno.com
```

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
```json
{
  "success": true,
  "message": "Email verified successfully."
}
```

#### Error Response: Invalid/Expired Token
- **Status**: `400 Bad Request`
- **Body**:
```json
{
  "type": "about:blank",
  "title": "Bad Request / Validation Error",
  "status": 400,
  "detail": "Verification token has expired.",
  "instance": "/auth/verify-email"
}
```

---

## 3. Login User

Authenticates email/password credentials and issues Access and Refresh tokens.

- **Method**: `POST`
- **Path**: `/auth/login`
- **Authentication**: `Public` (Rate-limited: Max 5 requests/15 minutes per IP)

### Request Payload Fields
| Name | Type | Rules / Constraints |
| :--- | :--- | :--- |
| `email` | String | Valid email address format, lowercased. |
| `password` | String | Required. |

#### Example Request
```http
POST /auth/login HTTP/1.1
Host: api.xeno.com
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)
X-Device-Info: Apple MacBook Pro
Content-Type: application/json

{
  "email": "architect@xeno.com",
  "password": "Password123!"
}
```

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "a67e42d2-8b43-4a11-bc66-3d234a921d7b",
    "email": "architect@xeno.com",
    "firstName": "Principal",
    "lastName": "Architect",
    "avatarUrl": "https://avatars.xeno.com/architect.png",
    "role": "USER",
    "isEmailVerified": true,
    "status": "ACTIVE",
    "createdAt": "2026-06-11T06:00:00.000Z",
    "updatedAt": "2026-06-11T06:00:00.000Z"
  }
}
```

#### Error Response: Invalid Credentials / Account Suspended
- **Status**: `401 Unauthorized`
- **Body**:
```json
{
  "type": "about:blank",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Invalid email or password.",
  "instance": "/auth/login"
}
```

---

## 4. Refresh Tokens (Rotation)

Rotates the current JWT Refresh Token, issuing a new Access/Refresh pair.

- **Method**: `POST`
- **Path**: `/auth/refresh`
- **Authentication**: `Public` (Uses JWT verification internally) (Rate-limited: Max 30 requests/15 minutes per IP)

### Request Payload Fields
| Name | Type | Rules |
| :--- | :--- | :--- |
| `refreshToken` | String | Valid JWT Refresh Token string. |

#### Example Request
```http
POST /auth/refresh HTTP/1.1
Host: api.xeno.com
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new...",
  "user": {
    "id": "a67e42d2-8b43-4a11-bc66-3d234a921d7b",
    "email": "architect@xeno.com",
    "firstName": "Principal",
    "lastName": "Architect",
    "avatarUrl": "https://avatars.xeno.com/architect.png",
    "role": "USER",
    "isEmailVerified": true,
    "status": "ACTIVE",
    "createdAt": "2026-06-11T06:00:00.000Z",
    "updatedAt": "2026-06-11T06:00:00.000Z"
  }
}
```

#### Error Response: Replayed or Revoked Session
- **Status**: `401 Unauthorized`
- **Body**:
```json
{
  "type": "about:blank",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Session has been revoked due to security compromise.",
  "instance": "/auth/refresh"
}
```

---

## 5. Logout User

Revokes the current user session.

- **Method**: `POST`
- **Path**: `/auth/logout`
- **Authentication**: `Private` (Requires valid Access JWT Bearer Token)

#### Example Request
```http
POST /auth/logout HTTP/1.1
Host: api.xeno.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Response Specs

#### Success Response
- **Status**: `204 No Content`
- **Body**: None

#### Error Response: Unauthenticated
- **Status**: `401 Unauthorized`
- **Body**:
```json
{
  "type": "about:blank",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Session has been revoked.",
  "instance": "/auth/logout"
}
```

---

## 6. Logout All Devices

Revokes all active sessions for the current user. Useful for security compromise recovery.

- **Method**: `POST`
- **Path**: `/auth/logout-all`
- **Authentication**: `Private` (Requires valid Access JWT Bearer Token)

#### Example Request
```http
POST /auth/logout-all HTTP/1.1
Host: api.xeno.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
```json
{
  "success": true
}
```

---

## 7. Forgot Password

Submits request to receive password reset link. Returns generic response.

- **Method**: `POST`
- **Path**: `/auth/forgot-password`
- **Authentication**: `Public` (Rate-limited: Max 3 requests/hour per IP)

### Request Payload Fields
| Name | Type | Rules |
| :--- | :--- | :--- |
| `email` | String | Valid email address, lowercased. |

#### Example Request
```http
POST /auth/forgot-password HTTP/1.1
Host: api.xeno.com
Content-Type: application/json

{
  "email": "architect@xeno.com"
}
```

### Response Specs

#### Success Response (Generic - returned whether email exists or not)
- **Status**: `200 OK`
- **Body**:
```json
{
  "success": true,
  "message": "If that email exists, we have sent instructions to reset the password."
}
```

---

## 8. Reset Password

Submits a new password along with the reset token to update the account password.

- **Method**: `POST`
- **Path**: `/auth/reset-password`
- **Authentication**: `Public` (Rate-limited: Max 5 requests/15 minutes per IP)

### Request Payload Fields
| Name | Type | Rules |
| :--- | :--- | :--- |
| `token` | String | The raw reset token received via email. |
| `password` | String | Complexity rule: min 8, max 100, must include uppercase, lowercase, digit, special char. |

#### Example Request
```http
POST /auth/reset-password HTTP/1.1
Host: api.xeno.com
Content-Type: application/json

{
  "token": "resettokenabcdef123456",
  "password": "NewSecurePassword999!"
}
```

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
```json
{
  "success": true,
  "message": "Password reset successfully. All sessions revoked."
}
```

#### Error Response: Expired or Consumed Token
- **Status**: `400 Bad Request`
- **Body**:
```json
{
  "type": "about:blank",
  "title": "Bad Request / Validation Error",
  "status": 400,
  "detail": "Password reset token has expired.",
  "instance": "/auth/reset-password"
}
```

---

## 9. Get Current User

Returns the authenticated user's profile.

- **Method**: `GET`
- **Path**: `/auth/me`
- **Authentication**: `Private` (Requires valid Access JWT Bearer Token)

#### Example Request
```http
GET /auth/me HTTP/1.1
Host: api.xeno.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
```json
{
  "id": "a67e42d2-8b43-4a11-bc66-3d234a921d7b",
  "email": "architect@xeno.com",
  "firstName": "Principal",
  "lastName": "Architect",
  "avatarUrl": "https://avatars.xeno.com/architect.png",
  "role": "USER",
  "isEmailVerified": true,
  "status": "ACTIVE"
}
```

---

## 10. Create Workspace

Creates a new brand workspace. The authenticated creator is assigned the `OWNER` membership role.

- **Method**: `POST`
- **Path**: `/workspaces`
- **Authentication**: `Private` (Requires valid Access JWT Bearer Token)

### Request Payload Fields
| Name | Type | Rules / Constraints |
| :--- | :--- | :--- |
| `name` | String | Required. Trimmed, min 3, max 100 characters. |
| `description` | String | Optional. Max 500 characters. |

#### Example Request
```http
POST /workspaces HTTP/1.1
Host: api.xeno.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "name": "Nike India",
  "description": "Sports Wear"
}
```

### Response Specs

#### Success Response
- **Status**: `201 Created`
- **Body**:
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

---

## 11. List Workspaces

Lists all workspaces the authenticated user is currently a member of.

- **Method**: `GET`
- **Path**: `/workspaces`
- **Authentication**: `Private` (Requires valid Access JWT Bearer Token)

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
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

---

## 12. Retrieve Workspace

Retrieves details for a specific workspace. Requires the authenticated user to be a member of the workspace.

- **Method**: `GET`
- **Path**: `/workspaces/:workspaceId`
- **Authentication**: `Private` (Requires valid Access JWT Bearer Token)

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
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

---

## 13. Preview Import Ingestion

Uploads a sales export CSV file to generate a preview. This parses the CSV, cleans data, detects conflicts, and suggests AI mappings, but does NOT persist customer or order data.

- **Method**: `POST`
- **Path**: `/workspaces/:workspaceId/imports/preview`
- **Authentication**: `Private` (Requires valid Access JWT Bearer Token & Workspace Membership)
- **Content-Type**: `multipart/form-data`

### Request Payload Fields
| Name | Type | Rules / Constraints |
| :--- | :--- | :--- |
| `file` | File | Required. Must be a `.csv` file. Maximum size 10MB. |

#### Example Request
```http
POST /workspaces/e6de27a4-d9bc-4df1-85b2-32a51241512f/imports/preview HTTP/1.1
Host: api.xeno.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="sales.csv"
Content-Type: text/csv

(binary data)
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
```json
{
  "importJobId": "b182cb05-3e28-4e08-9df2-ebae1c9448fd",
  "workspaceId": "e6de27a4-d9bc-4df1-85b2-32a51241512f",
  "fileName": "sales.csv",
  "totalRows": 1,
  "detectedMappings": {
    "first_name": "firstName",
    "last_name": "lastName",
    "email": "email",
    "phone": "phone",
    "amount": "amount",
    "order_date": "purchaseDate",
    "external_order_id": "externalOrderId"
  },
  "previewData": {
    "sampleTransformedRecords": [
      {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com",
        "phone": "+1234567890",
        "amount": 99.99,
        "purchaseDate": "2026-06-13T10:00:00.000Z",
        "externalOrderId": "ORD-1001"
      }
    ]
  },
  "conflictSummary": {
    "customersWithConflicts": 0,
    "ordersWithConflicts": 0
  }
}
```

---

## 14. Confirm Import Ingestion

Confirms and triggers the actual ingestion. Persists customer and order records under the specified resolution strategy.

- **Method**: `POST`
- **Path**: `/workspaces/:workspaceId/imports/confirm`
- **Authentication**: `Private` (Requires valid Access JWT Bearer Token & Workspace Membership)
- **Content-Type**: `application/json`

#### Example Request
```http
POST /workspaces/e6de27a4-d9bc-4df1-85b2-32a51241512f/imports/confirm HTTP/1.1
Host: api.xeno.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "importJobId": "b182cb05-3e28-4e08-9df2-ebae1c9448fd",
  "mappings": {
    "first_name": "firstName",
    "last_name": "lastName",
    "email": "email",
    "phone": "phone",
    "amount": "amount",
    "order_date": "purchaseDate",
    "external_order_id": "externalOrderId"
  },
  "resolutionStrategy": "KEEP_EXISTING",
  "overrides": [
    {
      "identifier": "nike@buyer.com",
      "strategy": "UPDATE_EXISTING"
    }
  ]
}
```

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
```json
{
  "id": "b182cb05-3e28-4e08-9df2-ebae1c9448fd",
  "workspaceId": "e6de27a4-d9bc-4df1-85b2-32a51241512f",
  "type": "SALES_EXPORT",
  "fileName": "sales.csv",
  "status": "COMPLETED",
  "totalRows": 1,
  "processedRows": 1,
  "successfulRows": 1,
  "failedRows": 0,
  "errorMessage": null,
  "createdAt": "2026-06-13T10:00:00.000Z",
  "completedAt": "2026-06-13T10:02:00.000Z"
}
```

---

## 15. List Import Jobs History

Retrieves the execution log and metric summary of all import jobs run in this workspace.

- **Method**: `GET`
- **Path**: `/workspaces/:workspaceId/imports`
- **Authentication**: `Private` (Requires valid Access JWT Bearer Token & Workspace Membership)

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
```json
[
  {
    "id": "b182cb05-3e28-4e08-9df2-ebae1c9448fd",
    "workspaceId": "e6de27a4-d9bc-4df1-85b2-32a51241512f",
    "type": "SALES_EXPORT",
    "fileName": "sales.csv",
    "status": "COMPLETED",
    "totalRows": 1,
    "processedRows": 1,
    "successfulRows": 1,
    "failedRows": 0,
    "createdAt": "2026-06-13T10:00:00.000Z",
    "completedAt": "2026-06-13T10:02:00.000Z"
  }
]
```

---

## 16. Retrieve Import Job Details

Retrieves details and preview parameters of a specific import job.

- **Method**: `GET`
- **Path**: `/workspaces/:workspaceId/imports/:importId`
- **Authentication**: `Private` (Requires valid Access JWT Bearer Token & Workspace Membership)

### Response Specs

#### Success Response
- **Status**: `200 OK`
- **Body**:
```json
{
  "id": "b182cb05-3e28-4e08-9df2-ebae1c9448fd",
  "workspaceId": "e6de27a4-d9bc-4df1-85b2-32a51241512f",
  "uploadedBy": "a67e42d2-8b43-4a11-bc66-3d234a921d7b",
  "type": "SALES_EXPORT",
  "fileName": "sales.csv",
  "status": "COMPLETED",
  "totalRows": 1,
  "processedRows": 1,
  "successfulRows": 1,
  "failedRows": 0,
  "errorMessage": null,
  "createdAt": "2026-06-13T10:00:00.000Z",
  "completedAt": "2026-06-13T10:02:00.000Z",
  "previewData": {
    "sampleTransformedRecords": []
  },
  "detectedMappings": {},
  "conflictSummary": {},
  "resolutionStrategy": "KEEP_EXISTING",
  "confirmedAt": "2026-06-13T10:01:30.000Z",
  "confirmedBy": "a67e42d2-8b43-4a11-bc66-3d234a921d7b"
}
```
