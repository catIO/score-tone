import Dexie, { type Table } from 'dexie';

export interface Bookmark {
  id: string;
  name: string;
  page: number;
  createdAt: number;
}

export interface ScoreFile {
  id: string; // Google Drive File ID or a generated UUID for local files
  name: string;
  source: 'local' | 'google-drive';
  lastOpened: number; // timestamp
  lastPage: number;
  offline: boolean; // whether the PDF Blob is saved in fileData
  size?: number; // size in bytes
  modifiedTime?: string; // from Google Drive
  thumbnail?: string; // base64 or link from Drive
  bookmarks?: Bookmark[];
}

export interface ScoreFileData {
  fileId: string;
  blob: Blob;
}

export interface CustomPreset {
  id: string;
  name: string;
  sepia: number;
  brightness: number;
  contrast: number;
  warmth: number;
  invert: boolean;
  highContrast: boolean;
  backgroundColor: string;
  inkDarkness: number;
}

class ScoreToneDatabase extends Dexie {
  files!: Table<ScoreFile, string>;
  fileData!: Table<ScoreFileData, string>;
  customPresets!: Table<CustomPreset, string>;

  constructor() {
    super('ScoreToneDatabase');
    this.version(1).stores({
      files: 'id, name, source, lastOpened, offline',
      fileData: 'fileId',
      customPresets: 'id, name'
    });
  }
}

export const db = new ScoreToneDatabase();

export const storageService = {
  // Get all metadata files sorted by last opened
  async getFiles(): Promise<ScoreFile[]> {
    return db.files.orderBy('lastOpened').reverse().toArray();
  },

  // Save metadata
  async saveFileMetadata(file: ScoreFile): Promise<void> {
    await db.files.put(file);
  },

  // Save PDF file data (Blob)
  async saveFileData(fileId: string, blob: Blob): Promise<void> {
    await db.fileData.put({ fileId, blob });
  },

  // Load PDF Blob
  async getFileData(fileId: string): Promise<Blob | null> {
    const data = await db.fileData.get(fileId);
    return data ? data.blob : null;
  },

  // Cache a file offline (save its blob and update metadata)
  async cacheFileOffline(file: ScoreFile, blob: Blob): Promise<void> {
    await db.transaction('rw', [db.files, db.fileData], async () => {
      const updatedFile = { ...file, offline: true };
      await db.files.put(updatedFile);
      await db.fileData.put({ fileId: file.id, blob });
    });
  },

  // Remove file completely (metadata + blob)
  async deleteFile(fileId: string): Promise<void> {
    await db.transaction('rw', [db.files, db.fileData], async () => {
      await db.files.delete(fileId);
      await db.fileData.delete(fileId);
    });
  },

  // Remove blob only (keep metadata but set offline = false)
  async removeFileFromOffline(fileId: string): Promise<void> {
    await db.transaction('rw', [db.files, db.fileData], async () => {
      const file = await db.files.get(fileId);
      if (file) {
        file.offline = false;
        await db.files.put(file);
      }
      await db.fileData.delete(fileId);
    });
  },

  // Save a custom filter preset
  async savePreset(preset: CustomPreset): Promise<void> {
    await db.customPresets.put(preset);
  },

  // Get custom presets
  async getPresets(): Promise<CustomPreset[]> {
    return db.customPresets.toArray();
  },

  // Delete a custom preset
  async deletePreset(id: string): Promise<void> {
    await db.customPresets.delete(id);
  }
};
