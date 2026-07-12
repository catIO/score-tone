# Proactive OAuth Token Refresh

## Background

Google Identity Services (GIS) tokens have a ~1-hour TTL. The current implementation
stores the expiry timestamp in `localStorage` and restores the token on startup only
if it has more than 2 minutes remaining. After that window passes, the first API call
returns a `401`, clears the token, and forces the user to re-authenticate via a popup.

For a music-stand app this is low-priority — sessions are short and performers won't
leave the app open for an hour mid-rehearsal. Implement this when silent re-auth on
long-lived sessions becomes a reported pain point.

## Current state (as of July 2026)

- Token is persisted in `localStorage` with a 2-minute expiry buffer (`EXPIRES_KEY`).
- `clearStoredToken()` is called on any `401` response.
- No proactive refresh logic exists; the user sees an error on the first stale request.

Relevant file: [`src/services/googleDriveService.ts`](../src/services/googleDriveService.ts)

---

## Proposed implementation

### 1. Expose token expiry to the service

Add a module-level `tokenExpiresAt: number | null` alongside `accessToken`:

```ts
let tokenExpiresAt: number | null = null;
```

Populate it when restoring from `localStorage` and when a new token arrives:

```ts
// On restore
tokenExpiresAt = expiresAt;

// In ensureTokenClient callback
tokenExpiresAt = Date.now() + (response.expires_in || 3600) * 1000;
localStorage.setItem(EXPIRES_KEY, tokenExpiresAt.toString());
```

### 2. Add `isTokenExpiringSoon()`

```ts
function isTokenExpiringSoon(bufferMs = 3 * 60 * 1000): boolean {
  if (!tokenExpiresAt) return true;
  return Date.now() >= tokenExpiresAt - bufferMs;
}
```

Use a 3-minute buffer so the refresh fires before the 401 window.

### 3. Silent re-auth in `getAccessToken()`

GIS supports `prompt: ''` (empty string) for a silent token refresh when the user
already has an active Google session. This does **not** show a popup.

```ts
async getAccessToken(): Promise<string> {
  // Fast path: token still valid
  if (accessToken && !isTokenExpiringSoon()) {
    return accessToken;
  }

  // Attempt silent refresh if we had a token before (user already consented)
  if (accessToken || tokenExpiresAt) {
    try {
      return await this.silentRefresh();
    } catch {
      // Silent refresh failed (e.g. session expired); fall through to popup
      clearStoredToken();
    }
  }

  // Full interactive auth (requires user gesture on first call)
  return new Promise((resolve, reject) => {
    this.ensureTokenClient(resolve, (err) =>
      reject(new Error(err.error_description || err.message || 'OAuth failed.'))
    ).then(() => {
      tokenClient?.requestAccessToken({ prompt: '' });
    }).catch(reject);
  });
},

async silentRefresh(): Promise<string> {
  return new Promise((resolve, reject) => {
    this.ensureTokenClient(resolve, reject).then(() => {
      if (!tokenClient) { reject(new Error('No token client')); return; }
      // prompt: '' = silent; will reject if session is gone
      tokenClient.requestAccessToken({ prompt: '' });
    }).catch(reject);
  });
},
```

> [!NOTE]
> `prompt: ''` is already used in `requestAccessToken` today. The difference is that
> this path is reached *before* a 401 rather than waiting for one.

### 4. Optional: background refresh timer

For sessions expected to run longer than an hour (e.g. a concert), add a timer that
refreshes the token ~5 minutes before expiry:

```ts
function scheduleTokenRefresh(): void {
  if (!tokenExpiresAt) return;
  const refreshAt = tokenExpiresAt - 5 * 60 * 1000; // 5 min before expiry
  const delay = refreshAt - Date.now();
  if (delay <= 0) return;

  setTimeout(async () => {
    try {
      await googleDriveService.silentRefresh();
    } catch {
      // Let the next real request handle it
    }
  }, delay);
}
```

Call `scheduleTokenRefresh()` after any successful token acquisition (restore or fresh).

This is the most user-invisible approach but adds complexity. Only add it if the
simpler just-in-time refresh in step 3 is insufficient.

---

## Acceptance criteria

- [ ] Opening a Drive file after 55 minutes of inactivity succeeds without a popup.
- [ ] `401` responses still clear the token and surface a sign-in prompt (fallback path).
- [ ] No visible delay is introduced on the fast path (cached valid token).
- [ ] `isTokenExpiringSoon()` is covered by a unit test with mocked `Date.now()`.

## Testing notes

To manually test without waiting an hour:

1. Sign in and get a token.
2. In the browser console, set `localStorage.setItem('scoretone_google_token_expires', Date.now() + 60_000)` (1-minute expiry).
3. Wait 58 seconds, then open a Drive file. It should refresh silently.
4. Let the 1 minute expire fully and check that the fallback re-auth works.
