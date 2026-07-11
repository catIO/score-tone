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

  // Initialize Google OAuth2 Token Client (no picker needed)
  initTokenClient(onTokenFetched: (token: string) => void, onError: (err: any) => void): void {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      onError(new Error('Google Identity Services client not loaded.'));
      return;
    }

    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (response: any) => {
          if (response.error) {
            onError(response);
            return;
          }
          accessToken = response.access_token;
          onTokenFetched(response.access_token);
        }
      });
    } catch (err) {
      onError(err);
    }
  },

  // Trigger Auth Token Flow (now dynamically loading script first)
  async getAccessToken(): Promise<string> {
    if (accessToken) {
      return accessToken;
    }

    await loadGsiScript();

    return new Promise((resolve, reject) => {
      this.initTokenClient(
        (token) => resolve(token),
        (err) => reject(new Error(err.message || 'OAuth authentication failed.'))
      );

      if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: '' });
      } else {
        reject(new Error('OAuth token client was not initialized.'));
      }
    });
  },

  // List PDF files from Google Drive using the REST API directly (no Picker widget needed)
  async listPdfFiles(token: string, pageToken?: string, searchTerm?: string): Promise<{ files: GoogleDriveFileMetadata[]; nextPageToken?: string; isFiltered: boolean }> {
    let query = `mimeType='application/pdf' and trashed=false`;
    let isFiltered = false;
    
    // If DRIVE_FOLDER_ID is set, we attempt to filter by that folder.
    if (DRIVE_FOLDER_ID) {
      query += ` and '${DRIVE_FOLDER_ID}' in parents`;
      isFiltered = true;
    }

    if (searchTerm) {
      // Escape single quotes for search
      const escaped = searchTerm.replace(/'/g, "\\'");
      query += ` and name contains '${escaped}'`;
    }
    
    const fields = encodeURIComponent('nextPageToken,files(id,name,size,modifiedTime,thumbnailLink)');
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${fields}&orderBy=modifiedTime+desc&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;

    let response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // If query failed (e.g. folder ID doesn't exist for this user), retry without the folder filter
    if (!response.ok && DRIVE_FOLDER_ID) {
      console.warn('[ScoreTone] Failed to filter by folder, retrying with global drive search...');
      isFiltered = false;
      let fallbackQuery = `mimeType='application/pdf' and trashed=false`;
      if (searchTerm) {
        fallbackQuery += ` and name contains '${searchTerm.replace(/'/g, "\\'")}'`;
      }
      url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fallbackQuery)}&fields=${fields}&orderBy=modifiedTime+desc&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
    }

    if (!response.ok) {
      if (response.status === 401) {
        accessToken = null;
      }
      throw new Error(`Failed to list Drive files: ${response.statusText}`);
    }

    const data = await response.json();
    let driveFiles = data.files || [];
    let nextToken = data.nextPageToken;

    // Google API Quirk: searching for a folder that isn't yours returns a "200 OK" status with an empty files list.
    // So if the list is empty and folder filtering was turned on, we fallback and search the entire Drive.
    if (driveFiles.length === 0 && DRIVE_FOLDER_ID) {
      console.warn('[ScoreTone] Folder search returned 0 files, retrying with global drive search...');
      isFiltered = false;
      let fallbackQuery = `mimeType='application/pdf' and trashed=false`;
      if (searchTerm) {
        fallbackQuery += ` and name contains '${searchTerm.replace(/'/g, "\\'")}'`;
      }
      const fallbackUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fallbackQuery)}&fields=${fields}&orderBy=modifiedTime+desc&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
      
      const fallbackResponse = await fetch(fallbackUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        driveFiles = fallbackData.files || [];
        nextToken = fallbackData.nextPageToken;
      }
    }

    return {
      files: driveFiles.map((f: any) => ({
        id: f.id,
        name: f.name,
        size: parseInt(f.size || '0', 10),
        modifiedTime: f.modifiedTime,
        thumbnailLink: f.thumbnailLink
      })),
      nextPageToken: nextToken,
      isFiltered
    };
  },

  // Download Google Drive File content as Blob
  async downloadFile(fileId: string): Promise<Blob> {
    const token = await this.getAccessToken();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        accessToken = null;
      }
      throw new Error(`Failed to download file from Google Drive: ${response.statusText}`);
    }

    return response.blob();
  },

  // Clear session token (logout/disconnect)
  logout(): void {
    accessToken = null;
    tokenClient = null;
  }
};
