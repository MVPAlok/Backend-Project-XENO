# Frontend Integration Guide — XENO Authentication

This guide documents how frontend clients (React, Vue, Next.js, etc.) should interface with the XENO authentication backend to maintain secure session lifecycles.

---

## 1. Token Storage Strategy & Security

To defend against Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF), adhere to the following token management blueprint:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Frontend Memory                               │
│  ┌────────────────────────┐         ┌──────────────────────────────┐   │
│  │   Access Token (JWT)   │ ──────> │ Zustand / Redux State Store  │   │
│  └────────────────────────┘         └──────────────────────────────┘   │
└────────────────────────────────────────────┬───────────────────────────┘
                                             │ (XSS Shielded: JS Memory Only)
                                             ▼
                                      Network Requests
                                             │
                                             ▼
┌────────────────────────────────────────────┴───────────────────────────┐
│                      Browser Secure Cookie Store                       │
│  ┌────────────────────────┐                                            │
│  │  Refresh Token (JWT)   │ (Secure, HttpOnly, SameSite=Lax/Strict)     │
│  └────────────────────────┘                                            │
└────────────────────────────────────────────────────────────────────────┘
```

### A. Access Token Storage
- **Strategy**: Store the **Access Token** in local JavaScript memory (e.g., in a React Context, Zustand store, or Redux state).
- **Rule**: Never write the Access Token to `localStorage` or `sessionStorage` because any malicious XSS scripts can scrape the storage keys.

### B. Refresh Token Storage
- **Strategy**: The XENO API routes accept refresh tokens in the JSON payload body (`POST /auth/refresh`). If your frontend and backend run on the same root domain, configure your middleware to use secure cookies.
- **Production Cookie Directives**:
  - `HttpOnly`: Blocks client-side JavaScript access (neutralizing XSS theft).
  - `Secure`: Restricts transmission to encrypted HTTPS connections.
  - `SameSite=Lax`: Prevents cross-site credential leaks (CSRF protection).

---

## 2. Axios Interceptor: Automated Token Rotation

When an Access Token expires (returns `401 Unauthorized`), the client must request a new Access Token using the `/auth/refresh` endpoint and retry the failed requests.

### The Concurrent Request Queueing Challenge
If a user loads a dashboard with 5 parallel API calls, all 5 might return a `401` concurrently when the Access Token expires. If the client makes 5 separate `/auth/refresh` calls, it will trigger the **Refresh Token Rotation (RTR)** replay attack mechanism on the server, resulting in global revocation!

**Solution**: Implement a queue to buffer failing requests, trigger a *single* refresh request, and distribute the new token to all buffered request callbacks.

### Production-Grade Axios Interceptor Implementation

```javascript
import axios from 'axios';

// Instantiate HTTP Client
const api = axios.create({
  baseURL: 'https://api.xeno.com',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Ephemeral in-memory store for the Access Token
let memoryAccessToken = null;

// Trackers for token refresh state
let isRefreshing = false;
let failedQueue = [];

// Helper to push requests into the retry buffer
const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

// 1. Request Interceptor: Attach Access Token to Outgoing Requests
api.interceptors.request.use(
  (config) => {
    if (memoryAccessToken && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${memoryAccessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 2. Response Interceptor: Intercept 401s and Rotate Token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Detect if error is a 401 and the request has not been retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      
      // If refresh token is already missing or refresh request itself failed, redirect to login
      if (originalRequest.url === '/auth/refresh') {
        clearAuthSession();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue this request while token refresh is in progress
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      return new Promise(async (resolve, reject) => {
        try {
          // Fetch token from local storage (or secure cookie if configured)
          const localRefreshToken = getLocalRefreshToken();
          
          if (!localRefreshToken) {
            throw new Error('Refresh token unavailable.');
          }

          // Call token refresh route
          const res = await axios.post('https://api.xeno.com/auth/refresh', {
            refreshToken: localRefreshToken,
          });

          const { accessToken, refreshToken: newRefreshToken } = res.data;

          // Save new tokens
          memoryAccessToken = accessToken;
          saveLocalRefreshToken(newRefreshToken);

          // Update standard headers for retrying requests
          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
          originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;

          // Release the queue
          processQueue(null, accessToken);
          resolve(api(originalRequest));
        } catch (refreshError) {
          processQueue(refreshError, null);
          clearAuthSession();
          reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      });
    }

    return Promise.reject(error);
  }
);

// Session Cleanup Helper
function clearAuthSession() {
  memoryAccessToken = null;
  localStorage.removeItem('xeno_refresh_token');
  
  // Dispatch a global event or redirect to login page
  window.dispatchEvent(new Event('auth_session_expired'));
  window.location.href = '/login';
}

function getLocalRefreshToken() {
  return localStorage.getItem('xeno_refresh_token');
}

function saveLocalRefreshToken(token) {
  localStorage.setItem('xeno_refresh_token', token);
}

export { api, memoryAccessToken };
```

---

## 3. Session Expiration & Compromise Flow

When a 401 error occurs due to a session compromise or forced global logout (such as password resets):

1. The backend returns a status of `401 Unauthorized` and an RFC7807 detail property like `"Session has been revoked due to security compromise."`.
2. The Axios response interceptor intercepts this failure.
3. The `clearAuthSession()` handler executes:
   - Wipes `memoryAccessToken` from JS RAM.
   - Clears `xeno_refresh_token` storage keys.
   - Triggers routing redirects back to `/login`.
   - Triggers user interface alerts: *"Your session was terminated for security reasons. Please log in again."*
