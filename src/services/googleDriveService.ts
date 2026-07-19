// Types for Google API and Identity Services
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

export interface GoogleDriveFileMetadata {
  id: string;
  name: string;
  size: number;
  modifiedTime?: string;
  thumbnailLink?: string;
}

let accessToken: string | null = null;
let tokenClient: any = null;
let tokenExpiresAt: number | null = null;
let refreshTimerId: ReturnType<typeof setTimeout> | null = null;
let loginHint: string | null = null;
let authInFlight: Promise<string> | null = null; // deduplicate concurrent getAccessToken() calls

const TOKEN_KEY = 'scoretone_google_token';
const EXPIRES_KEY = 'scoretone_google_token_expires';
const LOGIN_HINT_KEY = 'scoretone_google_login_hint';

function isTokenExpiringSoon(bufferMs = 3 * 60 * 1000): boolean {
  if (!tokenExpiresAt) return true;
  return Date.now() >= tokenExpiresAt - bufferMs;
}

function scheduleTokenRefresh(): void {
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }
  if (!tokenExpiresAt) return;
  const refreshAt = tokenExpiresAt - 5 * 60 * 1000; // 5 min before expiry
  const delay = refreshAt - Date.now();
  if (delay <= 0) return;

  refreshTimerId = setTimeout(async () => {
    try {
      await googleDriveService.silentRefresh();
      console.info('[ScoreTone] Token silently refreshed in background.');
    } catch {
      // Let the next real request handle re-auth
      console.warn('[ScoreTone] Background token refresh failed; will re-auth on next request.');
    }
  }, delay);
}

// Restore token and login hint on startup if still valid.
// Token is persisted in localStorage to enable seamless cross-tab link opening
// without triggering programmatic popup blockers.
try {
  const storedToken = localStorage.getItem(TOKEN_KEY);
  const storedExpires = localStorage.getItem(EXPIRES_KEY);
  if (storedToken && storedExpires) {
    const expiresAt = parseInt(storedExpires, 10);
    // Always restore tokenExpiresAt so getAccessToken() can take the silentRefresh
    // path even when the stored token is too close to expiry to use directly.
    tokenExpiresAt = expiresAt;
    // Add 2-minute safety buffer before using the token directly
    if (Date.now() < expiresAt - 120000) {
      accessToken = storedToken;
      scheduleTokenRefresh();
    }
  }
  loginHint = localStorage.getItem(LOGIN_HINT_KEY);
} catch (e) {
  console.warn('[ScoreTone] Failed to restore token from localStorage', e);
}

// Clear the cached token from memory and localStorage
function clearStoredToken(): void {
  accessToken = null;
  tokenExpiresAt = null;
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    // Preserve loginHint across token clears so silent refresh can still identify the account
  } catch (e) {
    console.warn('[ScoreTone] Failed to clear token from localStorage', e);
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || '';
export const DRIVE_FOLDER_ID = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || '';

// Helper to dynamically load the Google Identity Services library on-demand
function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    // Check if script is already in the document
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services.')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });
}

// Load the Google Picker API via gapi
function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) {
      resolve();
      return;
    }

    const loadGapi = (): Promise<void> => new Promise((res, rej) => {
      if (window.gapi?.load) { res(); return; }
      const existing = document.querySelector('script[src="https://apis.google.com/js/api.js"]');
      if (existing) {
        existing.addEventListener('load', () => res());
        existing.addEventListener('error', () => rej(new Error('Failed to load gapi.')));
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://apis.google.com/js/api.js';
      s.async = true;
      s.defer = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error('Failed to load gapi.'));
      document.head.appendChild(s);
    });

    loadGapi().then(() => {
      window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Failed to load Picker API.')) });
    }).catch(reject);
  });
}

export const googleDriveService = {
  isConfigured(): boolean {
    return !!CLIENT_ID;
  },

  hasToken(): boolean {
    return !!accessToken;
  },

  isTokenExpiringSoon(bufferMs?: number): boolean {
    return isTokenExpiringSoon(bufferMs);
  },

  // Initialize Google OAuth2 Token Client (no picker needed).
  // expectedState — the state value sent with requestAccessToken; validated in the
  // callback closure so each call site has its own isolated state (no shared storage).
  ensureTokenClient(onTokenFetched: (token: string) => void, onError: (err: any) => void, expectedState?: string): void {
    if (!window.google?.accounts?.oauth2) {
      loadGsiScript().then(() => {
        this.ensureTokenClient(onTokenFetched, onError, expectedState);
      }).catch(onError);
      return;
    }

    try {
      // Always (re-)initialize so the callback is fresh
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
        callback: (response: any) => {
          if (response.error) {
            onError(response);
            return;
          }

          // CSRF check — compare against the closure-captured expected state,
          // not sessionStorage, to avoid race conditions between concurrent calls.
          if (expectedState && (!response.state || response.state !== expectedState)) {
            onError(new Error('OAuth state check failed. Possible CSRF request.'));
            return;
          }

          accessToken = response.access_token;

          // Persist token in localStorage so other tabs can load it without popups
          try {
            const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
            tokenExpiresAt = expiresAt;
            localStorage.setItem(TOKEN_KEY, response.access_token);
            localStorage.setItem(EXPIRES_KEY, expiresAt.toString());
            scheduleTokenRefresh();
          } catch (e) {
            console.warn('[ScoreTone] Failed to save token to localStorage', e);
          }

          // Fetch the user's email so future silent refreshes can skip the account picker
          if (!loginHint) {
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${response.access_token}` }
            })
              .then(r => r.ok ? r.json() : null)
              .then(info => {
                if (info?.email) {
                  loginHint = info.email;
                  try { localStorage.setItem(LOGIN_HINT_KEY, info.email); } catch { /* ignore */ }
                }
              })
              .catch(() => { /* non-critical */ });
          }

          onTokenFetched(response.access_token);
        }
      });
    } catch (err) {
      onError(err);
    }
  },

  // Attempt a silent token refresh (no popup). Requires prior user consent.
  // NOTE: State validation is intentionally omitted here because silent refresh
  // has no redirect/popup surface vulnerable to CSRF, and some GIS implementations
  // do not echo the state parameter in prompt:'' flows.
  async silentRefresh(): Promise<string> {
    return new Promise((resolve, reject) => {
      const initAndRequest = () => {
        this.ensureTokenClient(
          (token) => resolve(token),
          (err) => {
            clearStoredToken();
            reject(err);
          }
        );
        if (!tokenClient) { reject(new Error('No token client')); return; }
        // prompt: '' = silent; login_hint avoids account picker for multi-account users
        tokenClient.requestAccessToken({ prompt: '', ...(loginHint ? { login_hint: loginHint } : {}) });
      };

      if (!window.google?.accounts?.oauth2) {
        loadGsiScript().then(initAndRequest).catch(reject);
      } else {
        initAndRequest();
      }
    });
  },

  // Return cached token immediately, attempt silent refresh if expiring soon,
  // or trigger the OAuth popup and wait for the result.
  // Must only be called from a user-gesture context the first time (browser popup policy).
  async getAccessToken(options?: { allowInteractive?: boolean }): Promise<string> {
    const allowInteractive = options?.allowInteractive ?? true;

    // Fast path: token still valid and not expiring soon
    if (accessToken && !isTokenExpiringSoon()) {
      return accessToken;
    }

    // Deduplicate: if an auth is already in flight (e.g. background timer racing
    // with a user click), reuse the same promise instead of starting a second one.
    if (authInFlight) {
      return authInFlight;
    }

    const doAuth = async (): Promise<string> => {
      // Attempt silent refresh if user previously consented (token existed)
      if (accessToken || tokenExpiresAt) {
        try {
          const token = await this.silentRefresh();
          return token;
        } catch (err) {
          // Silent refresh failed (e.g. Google session expired); fall through to interactive.
          console.warn('[ScoreTone] Silent refresh failed, falling back to interactive auth:', err);
          clearStoredToken();
        }
      }

      if (!allowInteractive) {
        throw new Error('Authentication required');
      }

      // Full interactive auth (requires user gesture on first call)
      // Uses default prompt (no prompt param) which shows the account picker
      // but skips the consent/unverified-app screen if the user already granted
      // this scope. Only falls back to prompt:'consent' when Google explicitly
      // responds with consent_required.
      return new Promise((resolve, reject) => {
        const state = Math.random().toString(36).substring(2, 15);

        const initAndRequest = () => {
          this.ensureTokenClient(
            (token) => resolve(token),
            (err) => {
              // Only force consent screen if Google explicitly says consent is needed
              if (err.error === 'consent_required') {
                const retryState = Math.random().toString(36).substring(2, 15);
                this.ensureTokenClient(
                  (token) => resolve(token),
                  (retryErr) => reject(new Error(retryErr.error_description || retryErr.message || 'OAuth authentication failed.')),
                  retryState
                );
                tokenClient.requestAccessToken({ prompt: 'consent', state: retryState, ...(loginHint ? { login_hint: loginHint } : {}) });
                return;
              }
              reject(new Error(err.error_description || err.message || 'OAuth authentication failed.'));
            },
            state
          );

          if (!tokenClient) {
            reject(new Error('OAuth token client could not be initialized.'));
            return;
          }
          tokenClient.requestAccessToken({ state, ...(loginHint ? { login_hint: loginHint } : {}) });
        };

        if (!window.google?.accounts?.oauth2) {
          loadGsiScript().then(initAndRequest).catch(reject);
        } else {
          initAndRequest();
        }
      });
    };

    authInFlight = doAuth().finally(() => { authInFlight = null; });
    return authInFlight;
  },

  // List PDF files from Google Drive using the REST API directly (no Picker widget needed).
  // Falls back to a global Drive search if a folder filter yields no results (either HTTP error or empty list).
  async listPdfFiles(token: string, pageToken?: string, searchTerm?: string): Promise<{ files: GoogleDriveFileMetadata[]; nextPageToken?: string; isFiltered: boolean }> {
    const fields = encodeURIComponent('nextPageToken,files(id,name,size,modifiedTime,thumbnailLink)');
    const escapedSearch = searchTerm ? searchTerm.replace(/'/g, "\\'") : '';

    const buildUrl = (includeFolder: boolean) => {
      let q = `mimeType='application/pdf' and trashed=false`;
      if (includeFolder && DRIVE_FOLDER_ID) q += ` and '${DRIVE_FOLDER_ID}' in parents`;
      if (escapedSearch) q += ` and name contains '${escapedSearch}'`;
      return `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${fields}&orderBy=modifiedTime+desc&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''
        }`;
    };

    const doFetch = async (url: string) => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        if (res.status === 401) clearStoredToken();
        throw new Error(`Failed to list Drive files: ${res.statusText}`);
      }
      return res.json();
    };

    // First attempt: with folder filter (if configured)
    if (DRIVE_FOLDER_ID) {
      try {
        const data = await doFetch(buildUrl(true));
        const driveFiles: any[] = data.files || [];

        // Google quirk: a 200 with 0 files when the folder isn't shared with the user
        if (driveFiles.length > 0 || !searchTerm) {
          // If we got results (or no search term to broaden), return them.
          // A legitimate empty folder should fall through only on initial load.
          if (driveFiles.length > 0) {
            return {
              files: driveFiles.map((f: any) => ({
                id: f.id, name: f.name,
                size: parseInt(f.size || '0', 10),
                modifiedTime: f.modifiedTime,
                thumbnailLink: f.thumbnailLink
              })),
              nextPageToken: data.nextPageToken,
              isFiltered: true
            };
          }
        }
        console.warn('[ScoreTone] Folder filter returned 0 results, falling back to global Drive search.');
      } catch (err: any) {
        // HTTP error with folder filter — fall through to global search
        console.warn('[ScoreTone] Folder filter request failed, falling back to global Drive search.', err.message);
      }
    }

    // Fallback (or primary if no folder configured): global Drive search
    const data = await doFetch(buildUrl(false));
    const driveFiles: any[] = data.files || [];
    return {
      files: driveFiles.map((f: any) => ({
        id: f.id, name: f.name,
        size: parseInt(f.size || '0', 10),
        modifiedTime: f.modifiedTime,
        thumbnailLink: f.thumbnailLink
      })),
      nextPageToken: data.nextPageToken,
      isFiltered: false
    };
  },

  // Download a Google Drive file's content as a Blob.
  // Accepts an already-acquired token to avoid redundant getAccessToken() calls
  // when the caller already holds a valid token.
  async downloadFile(fileId: string, existingToken?: string): Promise<Blob> {
    const token = existingToken || await this.getAccessToken({ allowInteractive: false });

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      if (response.status === 401) clearStoredToken();
      const detail = response.statusText || `HTTP ${response.status}`;
      throw new Error(`Failed to download file from Google Drive: ${detail}`);
    }

    return response.blob();
  },

  // Fetch updated metadata for a single file on Google Drive
  async getFileMetadata(fileId: string, token: string): Promise<GoogleDriveFileMetadata> {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,modifiedTime,thumbnailLink`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      if (response.status === 401) clearStoredToken();
      throw new Error(`Failed to fetch file metadata: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      size: parseInt(data.size || '0', 10),
      modifiedTime: data.modifiedTime,
      thumbnailLink: data.thumbnailLink
    };
  },

  // Open Google Picker to let user select a PDF. Files chosen through the Picker
  // are granted to the app under the drive.file scope.
  async openPicker(token: string): Promise<GoogleDriveFileMetadata | null> {
    await loadPickerApi();

    return new Promise((resolve) => {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
        .setMimeTypes('application/pdf')
        .setMode(window.google.picker.DocsViewMode.LIST)
        .setLabel('My Music');

      if (DRIVE_FOLDER_ID) {
        view.setParent(DRIVE_FOLDER_ID);
      }

      // Primary view: PDFs filtered to the configured folder (or all Drive)
      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .addView(new window.google.picker.DocsView()
          .setMimeTypes('application/pdf')
          .setIncludeFolders(true)
          .setSelectFolderEnabled(false)
          .setLabel('Google Drive'))
        .setOAuthToken(token)
        .setDeveloperKey(API_KEY)
        .setAppId(APP_ID)
        .setTitle('Select a PDF score')
        .setCallback((data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const doc = data.docs[0];
            resolve({
              id: doc.id,
              name: doc.name,
              size: doc.sizeBytes || 0,
              modifiedTime: doc.lastEditedUtc ? new Date(doc.lastEditedUtc).toISOString() : undefined,
              thumbnailLink: doc.iconUrl,
            });
          } else if (data.action === window.google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    });
  },

  // Return the current in-memory token without triggering auth.
  // Useful for passing to sub-components so they don't need to call getAccessToken().
  getCachedToken(): string | null {
    return accessToken;
  },

  // Clear session token (logout/disconnect)
  logout(): void {
    clearStoredToken();
    loginHint = null;
    try { localStorage.removeItem(LOGIN_HINT_KEY); } catch { /* ignore */ }
    tokenClient = null;
  }
};

// Start loading GSI script immediately on import to ensure window.google is ready
// and ensure ensureTokenClient can run synchronously within click event handlers.
if (typeof window !== 'undefined') {
  loadGsiScript().catch((err) => console.warn('[ScoreTone] Preloading GSI script failed:', err));
}
