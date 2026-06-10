# API Documentation

## Authentication API

**Base URL:** `/api/v1/auth`

> All authentication is strictly handled via `HttpOnly`, `Secure` cookies. Tokens are **never** exposed in the JSON response body to prevent XSS attacks.

### Email Verification Flow (Modern Industry Standards)

1. **User Registers (`POST /signup`)**:
   - The user inputs registration details. 
   - A secure, 64-character verification token is generated using `crypto.randomBytes(32)` on the server.
   - The SHA-256 hash of this token is saved to the database (the raw token is never stored).
   - An email is dispatched containing a client-side link (e.g. `http://localhost:5173/verify-email?token=RAW_TOKEN`).
   - In development, this email and link are printed directly to the server logs/console.

2. **Frontend Routing**:
   - The user clicks the link in their email which opens the frontend verification page (e.g., `/verify-email?token=RAW_TOKEN`).
   - The frontend reads the `token` parameter from the URL query string.

3. **Verification Request (`POST /verify-email`)**:
   - The frontend calls the backend `/verify-email` endpoint, submitting the `token` in the body.
   - The backend hashes the received token and compares it to the database record, verifying its validity and expiration time.
   - Upon a successful match, `isEmailVerified` is set to `true`.

---

### 1. Signup

Register a new user in the system. An email verification token is generated and sent.

| Method | Endpoint | Auth Required | Rate Limit |
| :--- | :--- | :--- | :--- |
| `POST` | `/signup` | No | 5 requests / 15 minutes |

**Request Headers**
| Header | Value | Required |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Yes |

**Request Body**
| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `email` | `string` | User's email address | Yes |
| `password` | `string` | Minimum 8 characters | Yes |
| `firstName` | `string` | User's first name | No |
| `lastName` | `string` | User's last name | No |

**Responses**
| Status Code | Description | Cookie Headers Set |
| :--- | :--- | :--- |
| `201 Created` | User created successfully | `accessToken`, `refreshToken` |
| `400 Bad Request` | Validation Error | None |
| `409 Conflict` | Email already exists | None |

**Success Response Payload (201)**
```json
{
  "status": "success",
  "message": "User created. Please verify your email.",
  "data": {
    "user": {
      "id": "uuid-string",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "USER"
    }
  }
}
```

---

### 2. Verify Email

Verify a user's email address using the token sent to their inbox.

| Method | Endpoint | Auth Required | Rate Limit |
| :--- | :--- | :--- | :--- |
| `POST` | `/verify-email` | No | 5 requests / 15 minutes |

**Request Headers**
| Header | Value | Required |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Yes |

**Request Body**
| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `token` | `string` | The 64-character verification token | Yes |

**Responses**
| Status Code | Description |
| :--- | :--- |
| `200 OK` | Email verified successfully |
| `400 Bad Request` | Invalid or expired token |

**Success Response Payload (200)**
```json
{
  "status": "success",
  "message": "Email verified successfully"
}
```

---

### 3. Resend Verification Email

Request a new verification token if the previous one expired.

| Method | Endpoint | Auth Required | Rate Limit |
| :--- | :--- | :--- | :--- |
| `POST` | `/resend-verification` | No | 5 requests / 15 minutes |

**Request Headers**
| Header | Value | Required |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Yes |

**Request Body**
| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `email` | `string` | User's email address | Yes |

**Responses**
| Status Code | Description |
| :--- | :--- |
| `200 OK` | Verification email resent |
| `400 Bad Request` | User not found or already verified |

**Success Response Payload (200)**
```json
{
  "status": "success",
  "message": "Verification email resent"
}
```

---

### 4. Login

Authenticate a verified user and establish a session.

| Method | Endpoint | Auth Required | Rate Limit |
| :--- | :--- | :--- | :--- |
| `POST` | `/login` | No | 5 requests / 15 minutes |

**Request Headers**
| Header | Value | Required |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Yes |

**Request Body**
| Field | Type | Description | Required |
| :--- | :--- | :--- | :--- |
| `email` | `string` | User's email address | Yes |
| `password` | `string` | User's password | Yes |

**Responses**
| Status Code | Description | Cookie Headers Set |
| :--- | :--- | :--- |
| `200 OK` | Login successful | `accessToken`, `refreshToken` |
| `400 Bad Request` | Validation Error | None |
| `401 Unauthorized`| Invalid credentials / Inactive | None |

**Success Response Payload (200)**
```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid-string",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "USER"
    }
  }
}
```

---

### 5. Get Current User (Me)

Get the currently authenticated user's profile.

| Method | Endpoint | Auth Required | Rate Limit |
| :--- | :--- | :--- | :--- |
| `GET` | `/me` | Yes (Cookies) | None |

> **Note:** Automatically uses the `accessToken` cookie. No `Authorization: Bearer` header is required.

**Responses**
| Status Code | Description |
| :--- | :--- |
| `200 OK` | Returned user profile |
| `401 Unauthorized` | Missing cookie, token revoked, or invalid |

**Success Response Payload (200)**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid-string",
      "email": "user@example.com",
      "role": "USER",
      "isActive": true,
      "tokenVersion": 0,
      "isEmailVerified": true
    }
  }
}
```

---

### 6. Logout

Logout a user. This globally invalidates the session by clearing cookies and incrementing the database `tokenVersion`.

| Method | Endpoint | Auth Required | Rate Limit |
| :--- | :--- | :--- | :--- |
| `POST` | `/logout` | Yes (Cookies) | None |

**Responses**
| Status Code | Description | Cookie Headers Cleared |
| :--- | :--- | :--- |
| `200 OK` | Logged out successfully | `accessToken`, `refreshToken` |

**Success Response Payload (200)**
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```
