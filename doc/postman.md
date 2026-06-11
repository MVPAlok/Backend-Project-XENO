# API Testing Guide (Postman) — XENO Authentication

This guide outlines how to structure a Postman collection to test the XENO Authentication flow, including automated scripts to manage token storage and rotation.

---

## 1. Environment Setup

Create a new Postman Environment (e.g., `XENO - Local`) and add the following variables:

| Variable Key | Initial Value | Current Value | Description |
| :--- | :--- | :--- | :--- |
| `baseUrl` | `http://localhost:5000` | `http://localhost:5000` | The backend API root address. |
| `accessToken` | *leave empty* | *will auto-populate* | Token for Authenticated routes. |
| `refreshToken` | *leave empty* | *will auto-populate* | Rotation Token. |
| `verifyToken` | *leave empty* | *will auto-populate* | Email verification helper. |
| `resetToken` | *leave empty* | *will auto-populate* | Password reset helper. |

---

## 2. Collection Directory Structure

Create a collection named `XENO Authentication` organized as follows:

```
XENO Authentication/
├── 1. Setup & Registration/
│   ├── POST Signup
│   └── POST Verify Email
├── 2. Session Management/
│   ├── POST Login
│   ├── POST Refresh Tokens
│   ├── POST Logout (Single)
│   └── POST Logout (All Devices)
├── 3. Recovery Flow/
│   ├── POST Forgot Password
│   └── POST Reset Password
└── 4. Profile/
    └── GET Get Current User (Me)
```

---

## 3. Automation Scripts (Tests Tab)

Postman's **Tests** tab allows you to run JavaScript after a response is received. We use it to parse tokens out of responses and write them directly into the active environment.

### A. Login Endpoint (`POST /auth/login`)
Place this script in the **Tests** tab of the Login request:

```javascript
// Ensure request succeeded before writing variables
if (pm.response.code === 200) {
    const responseData = pm.response.json();
    
    // Extract tokens
    if (responseData.accessToken && responseData.refreshToken) {
        pm.environment.set("accessToken", responseData.accessToken);
        pm.environment.set("refreshToken", responseData.refreshToken);
        console.log("✅ Tokens successfully updated in Environment!");
    } else {
        console.warn("⚠️ Login returned 200 but tokens were missing in response payload.");
    }
}

// Global Response Assertions
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response contains accessToken and refreshToken", function () {
    const json = pm.response.json();
    pm.expect(json).to.have.property('accessToken');
    pm.expect(json).to.have.property('refreshToken');
});
```

### B. Token Refresh Endpoint (`POST /auth/refresh`)
Place this script in the **Tests** tab of the Refresh Token request to maintain the token rotation loop:

```javascript
if (pm.response.code === 200) {
    const responseData = pm.response.json();
    
    // Save the brand new rotated tokens
    pm.environment.set("accessToken", responseData.accessToken);
    pm.environment.set("refreshToken", responseData.refreshToken);
    console.log("🔄 Rotated Access and Refresh tokens successfully in Environment!");
}

pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});
```

### C. Logout Endpoint (`POST /auth/logout` and `POST /auth/logout-all`)
Place this script in the **Tests** tab of the Logout requests to wipe local credentials:

```javascript
if (pm.response.code === 204 || pm.response.code === 200) {
    pm.environment.set("accessToken", "");
    pm.environment.set("refreshToken", "");
    console.log("🧹 Cleaned local tokens on logout.");
}
```

---

## 4. Injecting Authorization Headers

For all **Private** endpoints (Logout, Logout-all, Me):

1. Click on the Request or the parent folder.
2. Select the **Authorization** tab.
3. Set **Type** to `Bearer Token`.
4. Set the **Token** field to `{{accessToken}}`.

Postman will automatically replace `{{accessToken}}` with the active variable resolved by the login/refresh scripts.

---

## 5. Standard Assertions for all Requests

Add these assertions to the **Tests** tab of the parent collection folder to run them across all queries:

```javascript
// Check response latency
pm.test("Response time is less than 300ms", function () {
    pm.expect(pm.response.responseTime).to.be.below(300);
});

// Enforce Content-Type constraints for Error States
if (pm.response.code >= 400) {
    pm.test("Error state conforms to RFC7807 problem json", function () {
        pm.response.to.have.header("Content-Type", "application/problem+json; charset=utf-8");
        const json = pm.response.json();
        pm.expect(json).to.have.property('type');
        pm.expect(json).to.have.property('title');
        pm.expect(json).to.have.property('status');
    });
}
```
