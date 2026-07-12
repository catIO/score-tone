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

const TOKEN_KEY = 'scoretone_google_token';
const EXPIRES_KEY = 'scoretone_google_token_expires';

// Restore token on startup if it's still valid
try {
  const storedToken = localStorage.getItem(TOKEN_KEY);
  const storedExpires = localStorage.getItem(EXPIRES_KEY);
  if (storedToken && storedExpires) {
    const expiresAt = parseInt(storedExpires, 10);
    // Add 2-minute safety buffer before token expiration
    if (Date.now() < expiresAt - 120000) {
      accessToken = storedToken;
    }
  }
} catch (e) {
  console.warn('[ScoreTone] Failed to restore token from localStorage', e);
}

// Clear the cached token from memory and localStorage
function clearStoredToken(): void {
  accessToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  } catch (e) {
    console.warn('[ScoreTone] Failed to clear token from localStorage', e);
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
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

export const googleDriveService = {
  isConfigured(): boolean {
    return !!CLIENT_ID;
  },

  hasToken(): boolean {
    return !!accessToken;
  },

  // Initialize Google OAuth2 Token Client (no picker needed).
  // Returns the initialized client or throws.
  async ensureTokenClient(onTokenFetched: (token: string) => void, onError: (err: any) => void): Promise<void> {
    await loadGsiScript();

    if (!window.google?.accounts?.oauth2) {
      onError(new Error('Google Identity Services client not loaded.'));
      return;
    }

    try {
      // Always (re-)initialize so the callback is fresh
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (response: any) => {
          if (response.error) {
            onError(response);
            return;
          }

          const savedState = sessionStorage.getItem('st-oauth-state');
          if (!response.state || response.state !== savedState) {
            onError(new Error('OAuth state check failed. Possible CSRF request.'));
            return;
          }

          accessToken = response.access_token;

          // Persist token with 1-hour TTL
          try {
            const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
            localStorage.setItem(TOKEN_KEY, response.access_token);
            localStorage.setItem(EXPIRES_KEY, expiresAt.toString());
          } catch (e) {
            console.warn('[ScoreTone] Failed to save token to localStorage', e);
          }

          onTokenFetched(response.access_token);
        }
      });
    } catch (err) {
      onError(err);
    }
  },

  // Return cached token immediately, or trigger the OAuth popup and wait for the result.
  // Must only be called from a user-gesture context the first time (browser popup policy).
  async getAccessToken(): Promise<string> {
    if (accessToken) {
      return accessToken;
    }

    return new Promise((resolve, reject) => {
      const state = Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('st-oauth-state', state);

      this.ensureTokenClient(
        (token) => resolve(token),
        (err) => reject(new Error(err.error_description || err.message || 'OAuth authentication failed.'))
      ).then(() => {
        if (!tokenClient) {
          reject(new Error('OAuth token client could not be initialized.'));
          return;
        }
        tokenClient.requestAccessToken({ prompt: '', state: state });
      }).catch(reject);
    });
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
      return `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${fields}&orderBy=modifiedTime+desc&pageSize=100${
        pageToken ? `&pageToken=${pageToken}` : ''
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
    const token = existingToken || await this.getAccessToken();

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

  // Return the current in-memory token without triggering auth.
  // Useful for passing to sub-components so they don't need to call getAccessToken().
  getCachedToken(): string | null {
    return accessToken;
  },

  // Clear session token (logout/disconnect)
  logout(): void {
    clearStoredToken();
    tokenClient = null;
  }
};
