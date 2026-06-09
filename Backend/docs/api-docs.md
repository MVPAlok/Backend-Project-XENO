# API Documentation

## Authentication API

Base URL: `/api/v1/auth`

### 1. Signup

Register a new user in the system.

- **URL:** `/signup`
- **Method:** `POST`
- **Auth required:** No
- **Headers:** `Content-Type: application/json`

**Request Body**
```json
{
  "email": "user@example.com",
  "password": "strongpassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Success Response (201 Created)**
*Headers:* Set-Cookie: `refreshToken=<token>; HttpOnly; Secure; SameSite=Strict`
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid-string",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "USER"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses**
- **400 Bad Request** (Validation Error)
```json
{
  "status": "error",
  "errors": {
    "_errors": [],
    "email": { "_errors": ["Invalid email address"] }
  }
}
```
- **409 Conflict** (Email already exists)
```json
{
  "status": "error",
  "message": "Email is already in use"
}
```

---

### 2. Login

Authenticate an existing user.

- **URL:** `/login`
- **Method:** `POST`
- **Auth required:** No
- **Headers:** `Content-Type: application/json`

**Request Body**
```json
{
  "email": "user@example.com",
  "password": "strongpassword123"
}
```

**Success Response (200 OK)**
*Headers:* Set-Cookie: `refreshToken=<token>; HttpOnly; Secure; SameSite=Strict`
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid-string",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "USER"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses**
- **401 Unauthorized** (Invalid credentials)
```json
{
  "status": "error",
  "message": "Invalid credentials"
}
```
- **400 Bad Request** (Validation Error)
```json
{
  "status": "error",
  "errors": {
    "_errors": [],
    "password": { "_errors": ["Password is required"] }
  }
}
```

---

### 3. Logout

Logout a user by clearing the refresh token cookie.

- **URL:** `/logout`
- **Method:** `POST`
- **Auth required:** No (or Yes, depending on strictness, but typically No is fine as it just clears cookies)

**Success Response (200 OK)**
*Headers:* Set-Cookie: `refreshToken=; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

---

### 4. Get Current User (Protected Route Example)

Get the authenticated user's profile.

- **URL:** `/me`
- **Method:** `GET`
- **Auth required:** Yes
- **Headers:** `Authorization: Bearer <accessToken>`

**Success Response (200 OK)**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid-string",
      "email": "user@example.com",
      "role": "USER",
      "isActive": true
    }
  }
}
```

**Error Responses**
- **401 Unauthorized** (Missing or invalid token)
```json
{
  "status": "error",
  "message": "Unauthorized: Invalid or expired token"
}
```
