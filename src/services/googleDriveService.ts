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
let gapiInitialized = false;

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || ''; // Project Number

export const googleDriveService = {
  isConfigured(): boolean {
    return !!(CLIENT_ID && API_KEY && APP_ID);
  },

  // Initialize the Google API Client libraries
  initGapi(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (gapiInitialized) {
        resolve();
        return;
      }

      if (!window.gapi) {
        reject(new Error('Google API Client (gapi) script not loaded. Check network connection.'));
        return;
      }

      window.gapi.load('picker', {
        callback: () => {
          gapiInitialized = true;
          resolve();
        },
        onerror: () => {
          reject(new Error('Failed to load Google Picker API.'));
        }
      });
    });
  },

  // Initialize Google OAuth2 Token Client
  initTokenClient(onTokenFetched: (token: string) => void, onError: (err: any) => void): void {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      onError(new Error('Google Identity Services client not loaded.'));
      return;
    }

    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
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

    await this.initGapi();

    return new Promise((resolve, reject) => {
      this.initTokenClient(
        (token) => resolve(token),
        (err) => reject(new Error(err.message || 'OAuth authentication failed.'))
      );

      if (tokenClient) {
        // Request token (shows OAuth prompt to user)
        tokenClient.requestAccessToken({ prompt: '' });
      } else {
        reject(new Error('OAuth token client was not initialized.'));
      }
    });
  },

  // Open Google Picker to select a PDF
  async pickPdf(onSelected: (metadata: GoogleDriveFileMetadata) => void, onError: (err: any) => void): Promise<void> {
    try {
      const token = await this.getAccessToken();
      
      const pickerCallback = async (data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const doc = data[window.google.picker.Response.DOCUMENTS][0];
          const fileMetadata: GoogleDriveFileMetadata = {
            id: doc[window.google.picker.Document.ID],
            name: doc[window.google.picker.Document.NAME],
            size: doc[window.google.picker.Document.SIZE_BYTES] || 0,
            thumbnailLink: doc[window.google.picker.Document.THUMBNAIL_URL] || undefined
          };
          
          // Request extra file details from Drive API to get actual modified time if missing
          try {
            const driveMeta = await googleDriveService.fetchFileMetadata(fileMetadata.id, token);
            fileMetadata.modifiedTime = driveMeta.modifiedTime;
            if (driveMeta.thumbnailLink) {
              fileMetadata.thumbnailLink = driveMeta.thumbnailLink;
            }
          } catch (e) {
            console.warn('Failed to fetch rich metadata, using picker details', e);
          }

          onSelected(fileMetadata);
        } else if (data.action === window.google.picker.Action.CANCEL) {
          onError(new Error('Google Picker selection was cancelled.'));
        }
      };

      // Set up Google Picker
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.PDFS);
      view.setMimeTypes('application/pdf');

      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .setDeveloperKey(API_KEY)
        .setAppId(APP_ID)
        .setOAuthToken(token)
        .addView(view)
        .setCallback(pickerCallback)
        .setTitle('Select Score PDF')
        .build();

      picker.setVisible(true);
    } catch (err) {
      onError(err);
    }
  },

  // Get metadata details from Google Drive API
  async fetchFileMetadata(fileId: string, token: string): Promise<any> {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,modifiedTime,thumbnailLink`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch Drive file metadata: ${response.statusText}`);
    }

    return response.json();
  },

  // Download Google Drive File content as Blob
  async downloadFile(fileId: string): Promise<Blob> {
    const token = await this.getAccessToken();
    
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        // Clear token on auth error so next request triggers re-auth
        accessToken = null;
      }
      throw new Error(`Failed to download file from Google Drive: ${response.statusText}`);
    }

    return response.blob();
  },

  // Clear session token (logout/disconnect)
  logout(): void {
    accessToken = null;
  }
};
