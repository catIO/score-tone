import type { ScoreToneDatabase, ScoreFile, PageAnnotationRecord, CustomPreset, Bookmark, AnnotationStroke } from './storageService';
import type { AppSettings } from './settingsService';

export interface ScoreToneExportPackage {
    version: 1;
    appName: 'scoretone';
    exportedAt: string;
    stats: {
        scoreCount: number;
        annotationPageCount: number;
        presetCount: number;
    };
    scores: ScoreFile[];
    annotations: PageAnnotationRecord[];
    customPresets: CustomPreset[];
    settings?: Partial<AppSettings>;
}

export interface ImportSummary {
    scoresImported: number;
    scoresUpdated: number;
    annotationPagesImported: number;
    annotationPagesUpdated: number;
    presetsImported: number;
}

/**
 * Validates whether the given object conforms to the ScoreTone backup format.
 * Throws an Error with a descriptive message if invalid.
 */
export function validateBackupPackage(data: unknown): ScoreToneExportPackage {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid backup file: Root must be a JSON object.');
    }

    const obj = data as Record<string, any>;

    if (obj.appName !== 'scoretone') {
        throw new Error('Invalid backup file: Not a recognized ScoreTone export (appName mismatch).');
    }

    if (obj.version !== 1) {
        throw new Error(`Unsupported backup version: ${obj.version}. This version of ScoreTone supports version 1.`);
    }

    if (!Array.isArray(obj.scores)) {
        throw new Error('Invalid backup file: "scores" must be an array.');
    }

    for (let i = 0; i < obj.scores.length; i++) {
        const s = obj.scores[i];
        if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id.trim() || typeof s.name !== 'string') {
            throw new Error(`Invalid backup file: Score entry at index ${i} is missing an id or name.`);
        }
    }

    if (!Array.isArray(obj.annotations)) {
        throw new Error('Invalid backup file: "annotations" must be an array.');
    }

    for (let i = 0; i < obj.annotations.length; i++) {
        const a = obj.annotations[i];
        if (!a || typeof a !== 'object' || typeof a.fileId !== 'string' || typeof a.pageNumber !== 'number') {
            throw new Error(`Invalid backup file: Annotation entry at index ${i} is missing fileId or pageNumber.`);
        }
    }

    return {
        version: 1,
        appName: 'scoretone',
        exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
        stats: {
            scoreCount: obj.scores.length,
            annotationPageCount: obj.annotations.length,
            presetCount: Array.isArray(obj.customPresets) ? obj.customPresets.length : 0,
        },
        scores: obj.scores,
        annotations: obj.annotations,
        customPresets: Array.isArray(obj.customPresets) ? obj.customPresets : [],
        settings: obj.settings && typeof obj.settings === 'object' ? obj.settings : undefined,
    };
}

/**
 * Parses raw JSON string and validates it against the backup schema.
 */
export function parseBackupFile(jsonString: string): ScoreToneExportPackage {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    } catch (e: any) {
        throw new Error('Could not parse backup file: Invalid JSON syntax.');
    }
    return validateBackupPackage(parsed);
}

/**
 * Gathers all scores, annotations, and custom presets from the active Dexie database
 * and packages them into a clean export package.
 */
export async function exportLibraryBackup(
    db: ScoreToneDatabase,
    settings?: AppSettings,
): Promise<ScoreToneExportPackage> {
    const [scores, annotations, customPresets] = await Promise.all([
        db.files.toArray(),
        db.annotations.toArray(),
        db.customPresets.toArray(),
    ]);

    // Strip out unnecessary local runtime flags or null references if needed
    const cleanScores: ScoreFile[] = scores.map(s => ({
        ...s,
        // When exporting, ensure offline flag is preserved accurately
        offline: Boolean(s.offline),
    }));

    return {
        version: 1,
        appName: 'scoretone',
        exportedAt: new Date().toISOString(),
        stats: {
            scoreCount: cleanScores.length,
            annotationPageCount: annotations.length,
            presetCount: customPresets.length,
        },
        scores: cleanScores,
        annotations,
        customPresets,
        settings: settings ? { ...settings } : undefined,
    };
}

/**
 * Triggers a browser download of the export package as a .json file.
 */
export function triggerBackupDownload(pkg: ScoreToneExportPackage, customFilename?: string): void {
    const json = JSON.stringify(pkg, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = customFilename || `scoretone-backup-${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Deduplicates bookmarks when merging an existing score with an imported score.
 */
function mergeBookmarks(existing: Bookmark[] = [], imported: Bookmark[] = []): Bookmark[] {
    const existingMap = new Map<string, Bookmark>();
    for (const b of existing) {
        existingMap.set(b.id, b);
    }

    const merged = [...existing];
    for (const b of imported) {
        if (!existingMap.has(b.id)) {
            // Check if there is an exact semantic duplicate (same type, page, name)
            const duplicate = existing.find(e =>
                e.page === b.page &&
                e.type === b.type &&
                e.name === b.name
            );
            if (!duplicate) {
                merged.push(b);
                existingMap.set(b.id, b);
            }
        }
    }
    return merged;
}

/**
 * Deduplicates strokes when merging existing page annotations with imported page annotations.
 */
function mergeStrokes(existing: AnnotationStroke[] = [], imported: AnnotationStroke[] = []): AnnotationStroke[] {
    const existingIds = new Set(existing.map(s => s.id));
    const merged = [...existing];
    for (const stroke of imported) {
        if (!existingIds.has(stroke.id)) {
            merged.push(stroke);
            existingIds.add(stroke.id);
        }
    }
    return merged;
}

/**
 * Merges the backup package into the target IndexedDB database non-destructively.
 */
export async function importLibraryBackup(
    db: ScoreToneDatabase,
    pkg: ScoreToneExportPackage,
): Promise<ImportSummary> {
    const summary: ImportSummary = {
        scoresImported: 0,
        scoresUpdated: 0,
        annotationPagesImported: 0,
        annotationPagesUpdated: 0,
        presetsImported: 0,
    };

    await db.transaction('rw', [db.files, db.annotations, db.customPresets], async () => {
        // 1. Process Scores (metadata, bookmarks, loops, viewer preferences)
        for (const importedScore of pkg.scores) {
            const existing = await db.files.get(importedScore.id);
            if (existing) {
                const mergedBookmarks = mergeBookmarks(existing.bookmarks, importedScore.bookmarks);
                const updated: ScoreFile = {
                    ...existing,
                    bookmarks: mergedBookmarks,
                    tempo: importedScore.tempo ?? existing.tempo,
                    zoom: importedScore.zoom ?? existing.zoom,
                    fitMode: importedScore.fitMode ?? existing.fitMode,
                    scrollMode: importedScore.scrollMode ?? existing.scrollMode,
                    twoPageLandscape: importedScore.twoPageLandscape ?? existing.twoPageLandscape,
                    showRightHandFingering: importedScore.showRightHandFingering ?? existing.showRightHandFingering,
                    lastPage: existing.lastPage || importedScore.lastPage || 1,
                    // Retain offline status of current device
                    offline: existing.offline,
                };
                await db.files.put(updated);
                summary.scoresUpdated++;
            } else {
                // Score does not exist on this device yet:
                // Insert metadata with offline: false so bookmarks/loops are ready when score is accessed.
                const newScore: ScoreFile = {
                    ...importedScore,
                    offline: false,
                    lastOpened: importedScore.lastOpened || Date.now(),
                };
                await db.files.put(newScore);
                summary.scoresImported++;
            }
        }

        // 2. Process Annotations (strokes per page)
        for (const importedAnn of pkg.annotations) {
            const key: [string, number] = [importedAnn.fileId, importedAnn.pageNumber];
            const existing = await db.annotations.get(key);
            if (existing) {
                const mergedStrokes = mergeStrokes(existing.strokes, importedAnn.strokes);
                const updated: PageAnnotationRecord = {
                    ...existing,
                    strokes: mergedStrokes,
                    updatedAt: Math.max(existing.updatedAt || 0, importedAnn.updatedAt || 0),
                };
                await db.annotations.put(updated);
                summary.annotationPagesUpdated++;
            } else {
                await db.annotations.put({
                    ...importedAnn,
                });
                summary.annotationPagesImported++;
            }
        }

        // 3. Process Custom Presets
        for (const preset of pkg.customPresets) {
            await db.customPresets.put(preset);
            summary.presetsImported++;
        }
    });

    return summary;
}
