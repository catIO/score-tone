import Dexie, { type Table } from 'dexie';
import type { LoopRange } from './audioPlaybackService';

export interface Bookmark {
  id: string;
  name: string;
  page: number;
  createdAt: number;
  type?: 'page' | 'loop';
  loopRange?: LoopRange;
  bpm?: number;
}

export type FileFormat = 'pdf' | 'musicxml';

export interface ScoreFile {
  id: string; // Google Drive File ID or a generated UUID for local files
  name: string;
  source: 'local' | 'google-drive';
  fileType?: FileFormat; // defaults to 'pdf' if not specified
  lastOpened: number; // timestamp
  lastPage: number;
  offline: boolean; // whether the file Blob is saved in fileData
  size?: number; // size in bytes
  modifiedTime?: string; // from Google Drive
  thumbnail?: string; // base64 or link from Drive
  bookmarks?: Bookmark[];
  tempo?: number; // saved playback BPM
  zoom?: number; // saved per-score zoom level
}

export function isMusicXmlFile(file?: Partial<ScoreFile> | { name?: string; fileType?: string } | null): boolean {
  if (!file) return false;
  if (file.fileType === 'musicxml') return true;
  if (file.fileType === 'pdf') return false;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.xml') || name.endsWith('.musicxml') || name.endsWith('.mxl');
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

export type AnnotationTool = 'pen' | 'highlighter';

export interface StrokePoint {
  x: number; // 0.0 to 1.0 relative to page width
  y: number; // 0.0 to 1.0 relative to page height
  p?: number; // Pointer pressure (0.0 to 1.0)
}

export interface AnnotationStroke {
  id: string;
  tool: AnnotationTool;
  color: string;
  size: number;
  points: StrokePoint[];
  createdAt: number;
}

export interface PageAnnotationRecord {
  id?: string; // UUID for Supabase sync
  userId?: string; // Future Supabase auth user_id
  fileId: string;
  pageNumber: number;
  strokes: AnnotationStroke[];
  updatedAt: number;
  syncStatus?: 'synced' | 'pending' | 'local_only';
}

export class ScoreToneDatabase extends Dexie {
  files!: Table<ScoreFile, string>;
  fileData!: Table<ScoreFileData, string>;
  customPresets!: Table<CustomPreset, string>;
  annotations!: Table<PageAnnotationRecord, [string, number]>;

  constructor(accountId: string | null = null) {
    // Preserve the original database as the device/legacy library. Never claim
    // its contents for whichever Google account happens to connect first.
    super(accountId === null ? 'ScoreToneDatabase' : `ScoreToneDatabase:google:${encodeURIComponent(accountId)}`);
    this.version(1).stores({
      files: 'id, name, source, lastOpened, offline',
      fileData: 'fileId',
      customPresets: 'id, name'
    });
    this.version(2).stores({
      files: 'id, name, source, lastOpened, offline',
      fileData: 'fileId',
      customPresets: 'id, name',
      annotations: '[fileId+pageNumber], fileId, pageNumber, updatedAt'
    });
  }
}

export function createStorageService(accountId: string | null = null) {
  const db = new ScoreToneDatabase(accountId);
  return {
    db,
    accountId,
    // Get all metadata files sorted by last opened
    async getFiles(): Promise<ScoreFile[]> {
      return db.files.orderBy('lastOpened').reverse().toArray();
    },

    // Save metadata (merges with existing record to prevent overwriting bookmarks or other metadata)
    async saveFileMetadata(file: ScoreFile): Promise<void> {
      const existing = await db.files.get(file.id);
      if (!existing && !file.offline) {
        // Don't auto-create a library record for previewing unsaved shared scores
        return;
      }
      const merged: ScoreFile = {
        ...existing,
        ...file,
        bookmarks: file.bookmarks !== undefined ? file.bookmarks : existing?.bookmarks,
        lastPage: file.lastPage ?? existing?.lastPage ?? 1,
        zoom: file.zoom !== undefined ? file.zoom : existing?.zoom,
      };
      await db.files.put(merged);
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

    // Remove file completely (metadata + blob + annotations)
    async deleteFile(fileId: string): Promise<void> {
      await db.transaction('rw', [db.files, db.fileData, db.annotations], async () => {
        await db.files.delete(fileId);
        await db.fileData.delete(fileId);
        await db.annotations.where('fileId').equals(fileId).delete();
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
}

export type LibraryStorage = ReturnType<typeof createStorageService>;
