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

export const googleDriveService = {
  isConfigured(): boolean {
    return !!CLIENT_ID;
  },

  // Initialize Google OAuth2 Token Client (no gapi/picker needed)
  initTokenClient(onTokenFetched: (token: string) => void, onError: (err: any) => void): void {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      onError(new Error('Google Identity Services client not loaded.'));
      return;
    }

    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        // drive.readonly: lets us list + download any Drive file.
        // Works for test-mode users without Google verification.
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

  // Trigger Auth Token Flow
  async getAccessToken(): Promise<string> {
    if (accessToken) {
      return accessToken;
    }

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
  async listPdfFiles(token: string, pageToken?: string): Promise<{ files: GoogleDriveFileMetadata[]; nextPageToken?: string }> {
    const folderFilter = DRIVE_FOLDER_ID ? ` and '${DRIVE_FOLDER_ID}' in parents` : '';
    const query = encodeURIComponent(`mimeType='application/pdf' and trashed=false${folderFilter}`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,size,modifiedTime,thumbnailLink)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime+desc&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      if (response.status === 401) {
        accessToken = null;
      }
      throw new Error(`Failed to list Drive files: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      files: (data.files || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        size: parseInt(f.size || '0', 10),
        modifiedTime: f.modifiedTime,
        thumbnailLink: f.thumbnailLink
      })),
      nextPageToken: data.nextPageToken
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
