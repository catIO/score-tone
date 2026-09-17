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

export interface GoogleUserProfile {
  sub: string;
  name?: string;
  given_name?: string;
  email?: string;
  picture?: string;
}

export const GOOGLE_ACCOUNT_CHANGED_EVENT = 'scoretone:google-account-changed';
export const GOOGLE_CONNECTION_CHANGED_EVENT = 'scoretone:google-connection-changed';
export interface GoogleAccountChangedDetail {
  profile: GoogleUserProfile | null;
  accountId: string | null;
  previousAccountId: string | null;
  revision: number;
  reason: 'connected' | 'account-changed' | 'reconnected' | 'logout' | 'storage';
  initialConnection: boolean;
}

const TOKEN_KEY = 'scoretone_google_token';
const EXPIRES_KEY = 'scoretone_google_token_expires';
const LOGIN_HINT_KEY = 'scoretone_google_login_hint';
const USER_PROFILE_KEY = 'scoretone_google_user_profile';
const SESSION_EVENT_KEY = 'scoretone_google_session_event';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || '';
const LOAD_TIMEOUT_MS = 20_000;
const AUTH_TIMEOUT_MS = 120_000;
const PICKER_TIMEOUT_MS = 300_000;
const SCORE_MIME_TYPES = [
  'application/pdf', 'application/xml', 'text/xml',
  'application/vnd.recordare.musicxml+xml', 'application/vnd.recordare.musicxml',
];
// Drive sometimes assigns these generic MIME types to MusicXML/MXL uploads.
const PICKER_MIME_TYPES = [...SCORE_MIME_TYPES, 'text/plain', 'application/zip',
  'application/x-zip-compressed', 'application/octet-stream'].join(',');
const SCORE_EXTENSION = /\.(pdf|xml|musicxml|mxl)$/i;

let accessToken: string | null = null;
let tokenExpiresAt: number | null = null;
let loginHint: string | null = null;
let profile: GoogleUserProfile | null = null;
let sessionRevision = 0;
let authInFlight: Promise<string> | null = null;
let cancelAuth: (() => void) | null = null;

function readProfile(value: string | null): GoogleUserProfile | null {
  try {
    const info = value ? JSON.parse(value) : null;
    if (!info || typeof info.sub !== 'string' || !info.sub.trim()) return null;
    return {
      sub: info.sub,
      ...Object.fromEntries(['name', 'given_name', 'email', 'picture']
        .filter(key => typeof info[key] === 'string').map(key => [key, info[key]])),
    };
  } catch { return null; }
}

// Only the selected account's display profile survives reloads, never credentials.
try {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  profile = readProfile(localStorage.getItem(USER_PROFILE_KEY));
  loginHint = profile?.email || localStorage.getItem(LOGIN_HINT_KEY);
} catch { /* Storage may be unavailable; auth still works in memory. */ }

export function getSessionRevision(): number { return sessionRevision; }

function isTokenExpiringSoon(bufferMs = 3 * 60 * 1000): boolean {
  return !tokenExpiresAt || Date.now() >= tokenExpiresAt - bufferMs;
}

function clearStoredToken(failedToken?: string | null): void {
  // A late 401 from an old request must not clear a newer account's token.
  if (failedToken && failedToken !== accessToken) return;
  accessToken = null;
  tokenExpiresAt = null;
  window.dispatchEvent(new Event(GOOGLE_CONNECTION_CHANGED_EVENT));
}

function invalidateSession(): void {
  sessionRevision++;
  clearStoredToken();
  cancelAuth?.();
  cancelAuth = null;
  authInFlight = null;
}

function assertSession(revision: number): void {
  if (revision !== sessionRevision) throw new Error('Google account changed. Please select the score again.');
}

function assertCurrentToken(token: string): void {
  if (token !== accessToken || isTokenExpiringSoon(0)) {
    throw new Error('Google Drive connection changed or expired. Reconnect before selecting an online score.');
  }
}

function dispatchAccountChange(previousAccountId: string | null, reason: GoogleAccountChangedDetail['reason']): void {
  const detail: GoogleAccountChangedDetail = {
    profile: profile ? { ...profile } : null, accountId: profile?.sub ?? null,
    previousAccountId, revision: sessionRevision, reason,
    initialConnection: reason === 'connected' && previousAccountId === null,
  };
  window.dispatchEvent(new CustomEvent<GoogleAccountChangedDetail>(GOOGLE_ACCOUNT_CHANGED_EVENT, { detail }));
}

function persistProfile(): void {
  try {
    if (profile) localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(USER_PROFILE_KEY);
    if (loginHint) localStorage.setItem(LOGIN_HINT_KEY, loginHint);
    else localStorage.removeItem(LOGIN_HINT_KEY);
  } catch { /* Offline account selection remains available in this tab. */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    if (event.key !== null && ![USER_PROFILE_KEY, SESSION_EVENT_KEY, TOKEN_KEY, EXPIRES_KEY].includes(event.key)) return;
    const previousAccountId = profile?.sub ?? null;
    invalidateSession();
    try {
      // Read the latest value rather than replaying a potentially stale event value.
      profile = readProfile(localStorage.getItem(USER_PROFILE_KEY));
      loginHint = profile?.email || localStorage.getItem(LOGIN_HINT_KEY);
    } catch { profile = null; loginHint = null; }
    dispatchAccountChange(previousAccountId, 'storage');
  });
}

const scriptLoads = new Map<string, Promise<void>>();
function loadScript(src: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  const pending = scriptLoads.get(src);
  if (pending) return pending;
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const script = existing ?? document.createElement('script');
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    const onLoad = () => finish(ready() ? undefined : new Error('Google library loaded but is unavailable. Please retry.'));
    const onError = () => finish(new Error('Could not load Google services. Check your connection and browser settings, then retry.'));
    const timer = setTimeout(() => finish(new Error('Loading Google services timed out. Please retry.')), LOAD_TIMEOUT_MS);
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    if (!existing) {
      script.src = src;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  scriptLoads.set(src, promise);
  void promise.catch(() => scriptLoads.delete(src));
  return promise;
}

function loadGsiScript(): Promise<void> {
  return loadScript('https://accounts.google.com/gsi/client', () => !!window.google?.accounts?.oauth2);
}

async function loadPickerApi(): Promise<void> {
  if (window.google?.picker) return;
  await loadScript('https://apis.google.com/js/api.js', () => !!window.gapi?.load);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Google Picker loading timed out. Please retry.')), LOAD_TIMEOUT_MS);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    try {
      window.gapi.load('picker', {
        callback: () => finish(),
        onerror: () => finish(new Error('Google Picker could not load. Please retry or import a device file.')),
        timeout: LOAD_TIMEOUT_MS,
        ontimeout: () => finish(new Error('Google Picker loading timed out. Please retry.')),
      });
    } catch { finish(new Error('Google Picker could not initialize. Please retry.')); }
  });
}

function oauthError(error: any): Error {
  if (error?.type === 'popup_failed_to_open') return new Error('Sign-in popup blocked. Allow popups for this site and reconnect.');
  if (error?.type === 'popup_closed') return new Error('Sign-in popup closed. Reconnect when ready.');
  // Do not surface raw OAuth objects or potentially credential-bearing responses.
  return error instanceof Error ? error : new Error('Google sign-in failed. Reconnect and grant access to selected Drive files.');
}

function metadata(data: any): GoogleDriveFileMetadata {
  if (typeof data?.id !== 'string' || !data.id || typeof data.name !== 'string' || !data.name) {
    throw new Error('Google Drive returned incomplete score details. Select the file again with Google Picker.');
  }
  return {
    id: data.id, name: data.name, size: Number(data.size) || 0,
    modifiedTime: data.modifiedTime, thumbnailLink: data.thumbnailLink,
  };
}

function isSupportedScore(file: { name: string; mimeType?: string }): boolean {
  return SCORE_EXTENSION.test(file.name) || SCORE_MIME_TYPES.includes(file.mimeType ?? '');
}

export const googleDriveService = {
  isConfigured(): boolean { return !!CLIENT_ID; },
  hasToken(): boolean { return !!this.getCachedToken(); },
  isTokenExpiringSoon,
  getSessionRevision,

  // Compatibility only: never performs a background/silent OAuth request.
  async silentRefresh(): Promise<string> {
    return this.getAccessToken({ allowInteractive: false });
  },

  // Call interactive auth only from an explicit Connect/Reconnect/Choose account action.
  async getAccessToken(options?: { allowInteractive?: boolean; selectAccount?: boolean }): Promise<string> {
    const selectAccount = options?.selectAccount ?? false;
    const cached = this.getCachedToken();
    if (!selectAccount && cached) return cached;
    if (options?.allowInteractive === false) throw new Error('Reconnect Google Drive to access online scores. Offline scores remain available.');
    if (!CLIENT_ID) throw new Error('Google Drive sign-in is not configured. Import a score from your device instead.');
    if (selectAccount) invalidateSession();
    if (authInFlight) {
      const token = await authInFlight;
      assertCurrentToken(token);
      return token;
    }
    const revision = sessionRevision;
    const pending = new Promise<string>((resolve, reject) => {
      let settled = false;
      let verifying = false;
      const controller = new AbortController();
      const state = crypto.randomUUID();
      const finish = (error?: Error, token?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        controller.abort();
        if (cancelAuth === cancel) cancelAuth = null;
        if (error) reject(error); else resolve(token!);
      };
      const cancel = () => finish(new Error('Google sign-in cancelled because the session changed.'));
      const timer = setTimeout(() => finish(new Error('Google sign-in timed out. Please reconnect.')), AUTH_TIMEOUT_MS);
      cancelAuth = cancel;
      const start = () => {
        if (settled) return;
        try {
          assertSession(revision);
          const client = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: `${DRIVE_SCOPE} openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile`,
            include_granted_scopes: false,
            state,
            callback: async (response: any) => {
              if (settled || verifying) return;
              verifying = true;
              try {
                assertSession(revision);
                if (response.error) throw oauthError(response);
                if (response.state !== state) throw new Error('Google sign-in state validation failed. Please reconnect.');
                if (typeof response.access_token !== 'string' || !response.access_token ||
                  typeof response.scope !== 'string' || !response.scope.split(/\s+/).includes(DRIVE_SCOPE)) {
                  throw new Error('Access to selected Drive files was not granted. Reconnect and grant that permission.');
                }
                const expiresIn = Number(response.expires_in);
                if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error('Google returned an invalid token lifetime. Please reconnect.');
                const expiresAt = Date.now() + expiresIn * 1000;
                const result = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${response.access_token}` }, signal: controller.signal,
                });
                if (!result.ok) throw new Error('Could not verify your Google account. Please reconnect.');
                const verifiedProfile = readProfile(JSON.stringify(await result.json()));
                if (!verifiedProfile) throw new Error('Google did not return a valid account identifier. Please reconnect.');
                if (settled) return;
                assertSession(revision);
                if (Date.now() >= expiresAt) throw new Error('Google sign-in expired. Please reconnect.');
                const previousAccountId = profile?.sub ?? null;
                profile = verifiedProfile;
                loginHint = profile.email ?? profile.sub;
                accessToken = response.access_token;
                tokenExpiresAt = expiresAt;
                persistProfile();
                // Complete auth before notifying listeners. The first connection is not
                // cancellation: consumers should let its pending library action finish.
                if (previousAccountId !== profile.sub) sessionRevision++;
                finish(undefined, response.access_token);
                dispatchAccountChange(previousAccountId, previousAccountId === null ? 'connected'
                  : previousAccountId !== profile.sub ? 'account-changed' : 'reconnected');
              } catch (error) { finish(oauthError(error)); }
            },
            error_callback: (error: any) => finish(oauthError(error)),
          });
          client.requestAccessToken({
            state,
            ...(selectAccount ? { prompt: 'select_account' } : loginHint ? { login_hint: loginHint } : {}),
          });
        } catch (error) { finish(oauthError(error)); }
      };
      if (window.google?.accounts?.oauth2) start();
      else void loadGsiScript().then(start, error => finish(oauthError(error)));
    });
    authInFlight = pending;
    try {
      const token = await pending;
      assertCurrentToken(token);
      return token;
    }
    finally { if (authInFlight === pending) authInFlight = null; }
  },

  // drive.file only lists files already authorized for this app; never all Drive.
  // The historic method name is retained for callers; all supported scores are listed.
  async listPdfFiles(token: string, pageToken?: string, searchTerm?: string): Promise<{ files: GoogleDriveFileMetadata[]; nextPageToken?: string }> {
    assertCurrentToken(token);
    const revision = sessionRevision;
    const escapeQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    // Generic upload types are filtered by extension after fetching; Drive's
    // name-contains operator is not a reliable suffix search.
    const scoreQuery = [...PICKER_MIME_TYPES.split(',').map(type => `mimeType='${type}'`),
    ...['.pdf', '.xml', '.musicxml', '.mxl'].map(extension => `name contains '${extension}'`)].join(' or ');
    const q = `trashed=false and (${scoreQuery})${searchTerm ? ` and name contains '${escapeQuery(searchTerm)}'` : ''}`;
    const params = new URLSearchParams({
      q, fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink)',
      orderBy: 'modifiedTime desc', pageSize: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertSession(revision);
    if (!response.ok) {
      if (response.status === 401) clearStoredToken(token);
      throw new Error(response.status === 401
        ? 'Google Drive connection expired. Reconnect to load previously authorized scores.'
        : `Could not load previously authorized scores (HTTP ${response.status}). Try Google Picker or import a device file.`);
    }
    const data = await response.json();
    assertSession(revision);
    return {
      files: (data.files ?? []).filter(isSupportedScore).map(metadata),
      nextPageToken: data.nextPageToken,
    };
  },

  async downloadFile(fileId: string, existingToken?: string, signal?: AbortSignal): Promise<Blob> {
    if (existingToken) assertCurrentToken(existingToken);
    const revision = sessionRevision;
    const token = existingToken || this.getCachedToken();
    const id = encodeURIComponent(fileId);
    // Public endpoints can only serve publicly accessible files, not grant access.
    const requests: { url: string; authenticated?: boolean }[] = [
      ...(token ? [{ url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media`, authenticated: true }] : []),
      { url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media${API_KEY ? `&key=${encodeURIComponent(API_KEY)}` : ''}` },
      { url: `https://lh3.googleusercontent.com/d/${id}` },
      { url: `https://docs.google.com/uc?export=download&id=${id}&confirm=t` },
    ];
    let authenticatedStatus: number | undefined;
    for (const request of requests) {
      assertSession(revision);
      signal?.throwIfAborted();
      try {
        const response = await fetch(request.url, {
          headers: request.authenticated ? { Authorization: `Bearer ${token}` } : undefined, signal,
        });
        assertSession(revision);
        if (request.authenticated && !response.ok) authenticatedStatus = response.status;
        if (request.authenticated && response.status === 401) clearStoredToken(token);
        if (response.ok && !(response.headers.get('content-type') || '').includes('text/html')) {
          const blob = await response.blob();
          assertSession(revision);
          return blob;
        }
      } catch (error) {
        assertSession(revision);
        signal?.throwIfAborted();
        if (error instanceof Error && error.name === 'AbortError') throw error;
      }
    }
    throw new Error(`Could not download this Google Drive score${authenticatedStatus ? ` (authenticated request: HTTP ${authenticatedStatus})` : ''}. Reconnect if needed and select it with Google Picker using an account that has access, or import a device file. A pasted link does not grant access.`);
  },

  async getFileMetadata(fileId: string, token?: string | null): Promise<GoogleDriveFileMetadata> {
    if (token) assertCurrentToken(token);
    const revision = sessionRevision;
    const params = new URLSearchParams({ fields: 'id,name,mimeType,size,modifiedTime,thumbnailLink' });
    if (API_KEY) params.set('key', API_KEY);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    assertSession(revision);
    if (!response.ok) {
      if (response.status === 401 && token) clearStoredToken(token);
      throw new Error(`Could not read score details (HTTP ${response.status}). Select the file with Google Picker using an account that has access, or import a device file. Pasting a link does not grant permission.`);
    }
    const data = await response.json();
    assertSession(revision);
    const file = metadata(data);
    if (!isSupportedScore(data)) throw new Error('Select a PDF, MusicXML (.xml or .musicxml), or compressed MusicXML (.mxl) score.');
    return file;
  },

  async openPicker(token: string, signal?: AbortSignal): Promise<GoogleDriveFileMetadata | null> {
    if (signal?.aborted) return null;
    assertCurrentToken(token);
    if (!API_KEY || !APP_ID) throw new Error('Google Picker is not configured. Choose a previously authorized score or import a device file.');
    const revision = sessionRevision;
    await loadPickerApi();
    if (signal?.aborted) return null;
    assertSession(revision);
    assertCurrentToken(token);
    return new Promise((resolve, reject) => {
      let picker: any;
      let settled = false;
      const finish = (file: GoogleDriveFileMetadata | null, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener(GOOGLE_ACCOUNT_CHANGED_EVENT, onAccountChanged);
        signal?.removeEventListener('abort', onAbort);
        try { picker?.setVisible(false); } catch { /* Always attempt disposal. */ }
        try { picker?.dispose(); } catch { /* Cleanup must not prevent settlement. */ }
        if (error) reject(error); else resolve(file);
      };
      const onAccountChanged = () => {
        if (revision !== sessionRevision) finish(null, new Error('Google account changed. Open Google Picker again.'));
      };
      const onAbort = () => finish(null);
      const timer = setTimeout(() => finish(null, new Error('Google Picker timed out. Open it again or import a device file.')), PICKER_TIMEOUT_MS);
      window.addEventListener(GOOGLE_ACCOUNT_CHANGED_EVENT, onAccountChanged);
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
          .setMimeTypes(PICKER_MIME_TYPES)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(false)
          .setMode(window.google.picker.DocsViewMode.LIST);
        picker = new window.google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(token)
          .setDeveloperKey(API_KEY)
          .setAppId(APP_ID)
          .setOrigin(window.location.origin)
          .setTitle('Select a PDF, MusicXML, or MXL score')
          .setCallback((data: any) => {
            if (settled) return;
            try {
              assertSession(revision);
              if (data.action === window.google.picker.Action.PICKED) {
                const doc = data.docs?.[0];
                const file = metadata({
                  ...doc, size: doc?.sizeBytes,
                  modifiedTime: doc?.lastEditedUtc ? new Date(doc.lastEditedUtc).toISOString() : undefined
                });
                if (!isSupportedScore(doc)) throw new Error('Select a PDF, MusicXML (.xml or .musicxml), or compressed MusicXML (.mxl) score.');
                finish(file);
              } else if (data.action === window.google.picker.Action.CANCEL) finish(null);
              else if (data.action === 'error' || data.error) {
                finish(null, new Error('Google Picker reported an error. Check your connection and Picker configuration, then retry or import a device file.'));
              }
            } catch (error) { finish(null, error instanceof Error ? error : new Error('Could not read the selected score.')); }
          })
          .build();
        if (settled) { picker.dispose(); return; }
        picker.setVisible(true);
      } catch { finish(null, new Error('Google Picker could not open. Check your connection and browser settings, then retry or import a device file.')); }
    });
  },

  getCachedToken(): string | null {
    return accessToken && !isTokenExpiringSoon() ? accessToken : null;
  },

  // UI-only expiry scheduling; never renew credentials in a timer.
  getTokenValidityRemainingMs(): number {
    return accessToken && tokenExpiresAt ? Math.max(0, tokenExpiresAt - Date.now() - 3 * 60 * 1000) : 0;
  },

  logout(): void {
    const previousAccountId = profile?.sub ?? null;
    invalidateSession();
    profile = null;
    loginHint = null;
    persistProfile();
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXPIRES_KEY);
      // Notify other tabs even when no profile was persisted in this tab.
      localStorage.setItem(SESSION_EVENT_KEY, crypto.randomUUID());
    } catch { /* Local logout always succeeds, even without storage. */ }
    dispatchAccountChange(previousAccountId, 'logout');
  },

  getUserProfile(): GoogleUserProfile | null { return profile ? { ...profile } : null; },
};

// Preload code, not credentials, to keep explicit sign-in inside the click gesture.
if (typeof window !== 'undefined') void loadGsiScript().catch(() => { /* An explicit reconnect can retry. */ });
