import type { ScoreToneDatabase, PageAnnotationRecord, AnnotationStroke } from './storageService';

export function createAnnotationService(db: ScoreToneDatabase) {
  // Debounce save timer map: key `${fileId}_${pageNumber}` -> timeout
  const saveTimers = new Map<string, number>();

  const annotationService = {
    /**
     * Fetch saved strokes for a specific page of a score file.
     */
    async getPageAnnotations(fileId: string, pageNumber: number): Promise<AnnotationStroke[]> {
      try {
        const record = await db.annotations.get([fileId, pageNumber]);
        return record ? record.strokes : [];
      } catch (err) {
        console.warn(`Failed to get annotations for ${fileId} p.${pageNumber}:`, err);
        return [];
      }
    },

    /**
     * Save strokes for a specific page of a score file immediately.
     */
    async savePageAnnotations(fileId: string, pageNumber: number, strokes: AnnotationStroke[]): Promise<void> {
      const key = `${fileId}_${pageNumber}`;
      if (saveTimers.has(key)) {
        window.clearTimeout(saveTimers.get(key));
        saveTimers.delete(key);
      }

      try {
        const existing = await db.annotations.get([fileId, pageNumber]);
        const record: PageAnnotationRecord = {
          id: existing?.id || crypto.randomUUID(),
          fileId,
          pageNumber,
          strokes,
          updatedAt: Date.now(),
          syncStatus: 'pending',
        };
        await db.annotations.put(record);
      } catch (err) {
        console.warn(`Failed to save annotations for ${fileId} p.${pageNumber}:`, err);
      }
    },

    /**
     * Debounced save for live drawing: saves 350ms after the last stroke finishes.
     */
    queueSavePageAnnotations(fileId: string, pageNumber: number, strokes: AnnotationStroke[], delay = 350): void {
      const key = `${fileId}_${pageNumber}`;
      if (saveTimers.has(key)) {
        window.clearTimeout(saveTimers.get(key));
      }
      const timer = window.setTimeout(() => {
        saveTimers.delete(key);
        annotationService.savePageAnnotations(fileId, pageNumber, strokes);
      }, delay);
      saveTimers.set(key, timer);
    },

    /**
     * Delete annotations for a single page.
     */
    async deletePageAnnotations(fileId: string, pageNumber: number): Promise<void> {
      try {
        await db.annotations.delete([fileId, pageNumber]);
      } catch (err) {
        console.warn(`Failed to delete annotations for ${fileId} p.${pageNumber}:`, err);
      }
    },

    /**
     * Get all annotated pages for a file (useful for overview, export, or cloud sync).
     */
    async getFileAnnotations(fileId: string): Promise<PageAnnotationRecord[]> {
      try {
        return await db.annotations.where('fileId').equals(fileId).toArray();
      } catch (err) {
        console.warn(`Failed to get annotations for file ${fileId}:`, err);
        return [];
      }
    },

    /**
     * Delete all annotations for a file (e.g. when file is removed).
     */
    async deleteFileAnnotations(fileId: string): Promise<void> {
      try {
        await db.annotations.where('fileId').equals(fileId).delete();
      } catch (err) {
        console.warn(`Failed to delete all annotations for file ${fileId}:`, err);
      }
    },

    /**
     * Prepares local records for Supabase cloud sync (premium tier ready).
     */
    async exportForSupabase(fileId: string, userId?: string): Promise<PageAnnotationRecord[]> {
      const records = await this.getFileAnnotations(fileId);
      return records.map(r => ({
        ...r,
        userId: userId || r.userId,
      }));
    },

    /**
     * Imports remote records from Supabase cloud sync.
     */
    async importFromSupabase(records: PageAnnotationRecord[]): Promise<void> {
      try {
        await db.transaction('rw', db.annotations, async () => {
          for (const rec of records) {
            await db.annotations.put({
              ...rec,
              syncStatus: 'synced',
            });
          }
        });
      } catch (err) {
        console.warn('Failed to import annotations from Supabase:', err);
      }
    }
  };
  return annotationService;
}
