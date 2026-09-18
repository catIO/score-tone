import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    exportLibraryBackup,
    importLibraryBackup,
    parseBackupFile,
    validateBackupPackage,
    type ScoreToneExportPackage,
} from './backupService';
import {
    createStorageService,
    type AnnotationStroke,
    type CustomPreset,
    type LibraryStorage,
    type ScoreFile,
} from './storageService';

const opened: LibraryStorage[] = [];
beforeEach(() => vi.stubGlobal('Blob', NodeBlob));

function library(accountId: string | null = null) {
    const store = createStorageService(accountId);
    opened.push(store);
    return store;
}

afterEach(async () => {
    const stores = opened.splice(0);
    for (const store of stores) store.db.close();
    for (const store of stores) await store.db.delete();
    vi.unstubAllGlobals();
});

const sampleScore: ScoreFile = {
    id: 'drive-score-123',
    name: 'Moonlight Sonata',
    source: 'google-drive',
    offline: true,
    lastOpened: 1720000000000,
    lastPage: 3,
    tempo: 120,
    zoom: 1.25,
    bookmarks: [
        {
            id: 'loop-1',
            name: 'Exposition Loop',
            page: 1,
            type: 'loop',
            loopRange: { startBeat: 0, endBeat: 16, startMeasure: 1, endMeasure: 4 },
            bpm: 110,
            createdAt: 1720000001000,
        },
    ],
};

const sampleStroke: AnnotationStroke = {
    id: 'stroke-1',
    tool: 'pen',
    color: '#ff0000',
    size: 3,
    points: [{ x: 0.2, y: 0.3 }],
    createdAt: 1720000002000,
};

const samplePreset: CustomPreset = {
    id: 'preset-night',
    name: 'Night Glow',
    sepia: 20,
    brightness: 90,
    contrast: 110,
    warmth: 15,
    invert: true,
    highContrast: false,
    backgroundColor: '#000000',
    inkDarkness: 100,
};

describe('backupService validation & parsing', () => {
    it('validates a compliant ScoreTone backup package', () => {
        const pkg: ScoreToneExportPackage = {
            version: 1,
            appName: 'scoretone',
            exportedAt: new Date().toISOString(),
            stats: { scoreCount: 1, annotationPageCount: 1, presetCount: 1 },
            scores: [sampleScore],
            annotations: [
                {
                    fileId: 'drive-score-123',
                    pageNumber: 1,
                    strokes: [sampleStroke],
                    updatedAt: 1720000003000,
                },
            ],
            customPresets: [samplePreset],
        };

        const validated = validateBackupPackage(pkg);
        expect(validated.appName).toBe('scoretone');
        expect(validated.scores).toHaveLength(1);
        expect(validated.scores[0].name).toBe('Moonlight Sonata');
    });

    it('rejects non-object or missing appName', () => {
        expect(() => validateBackupPackage(null)).toThrow(/Root must be a JSON object/);
        expect(() => validateBackupPackage({ appName: 'otherapp', version: 1, scores: [], annotations: [] })).toThrow(/appName mismatch/);
        expect(() => validateBackupPackage({ appName: 'scoretone', version: 2, scores: [], annotations: [] })).toThrow(/Unsupported backup version/);
    });

    it('rejects malformed scores or annotations', () => {
        expect(() => validateBackupPackage({
            appName: 'scoretone',
            version: 1,
            scores: [{ id: '', name: 'Test' }],
            annotations: [],
        })).toThrow(/missing an id or name/);

        expect(() => validateBackupPackage({
            appName: 'scoretone',
            version: 1,
            scores: [],
            annotations: [{ fileId: '123' }], // missing pageNumber
        })).toThrow(/missing fileId or pageNumber/);
    });

    it('parses valid JSON string and rejects invalid JSON syntax', () => {
        const json = JSON.stringify({
            appName: 'scoretone',
            version: 1,
            scores: [],
            annotations: [],
        });
        expect(parseBackupFile(json).scores).toEqual([]);
        expect(() => parseBackupFile('{ invalid json ')).toThrow(/Invalid JSON syntax/);
    });
});

describe('backupService export and import', () => {
    it('exports all scores, annotations, and custom presets from the database', async () => {
        const store = library('test-export');
        await store.db.files.put(sampleScore);
        await store.db.annotations.put({
            fileId: sampleScore.id,
            pageNumber: 1,
            strokes: [sampleStroke],
            updatedAt: 1720000005000,
        });
        await store.savePreset(samplePreset);

        const exported = await exportLibraryBackup(store.db);

        expect(exported.appName).toBe('scoretone');
        expect(exported.version).toBe(1);
        expect(exported.scores).toHaveLength(1);
        expect(exported.scores[0].id).toBe('drive-score-123');
        expect(exported.scores[0].bookmarks?.[0].type).toBe('loop');
        expect(exported.annotations).toHaveLength(1);
        expect(exported.annotations[0].strokes[0].id).toBe('stroke-1');
        expect(exported.customPresets).toHaveLength(1);
        expect(exported.customPresets[0].name).toBe('Night Glow');
    });

    it('imports scores and annotations into a fresh library with offline: false', async () => {
        const store = library('test-import-fresh');

        const pkg: ScoreToneExportPackage = {
            version: 1,
            appName: 'scoretone',
            exportedAt: new Date().toISOString(),
            stats: { scoreCount: 1, annotationPageCount: 1, presetCount: 1 },
            scores: [sampleScore],
            annotations: [
                {
                    fileId: sampleScore.id,
                    pageNumber: 1,
                    strokes: [sampleStroke],
                    updatedAt: 1720000005000,
                },
            ],
            customPresets: [samplePreset],
        };

        const summary = await importLibraryBackup(store.db, pkg);

        expect(summary.scoresImported).toBe(1);
        expect(summary.scoresUpdated).toBe(0);
        expect(summary.annotationPagesImported).toBe(1);
        expect(summary.presetsImported).toBe(1);

        const loadedFiles = await store.getFiles();
        expect(loadedFiles).toHaveLength(1);
        expect(loadedFiles[0].id).toBe('drive-score-123');
        expect(loadedFiles[0].offline).toBe(false); // Blob is not downloaded yet
        expect(loadedFiles[0].bookmarks?.[0].loopRange?.startMeasure).toBe(1);

        const loadedAnnotations = await store.db.annotations.get(['drive-score-123', 1]);
        expect(loadedAnnotations?.strokes).toHaveLength(1);
        expect(loadedAnnotations?.strokes[0].id).toBe('stroke-1');

        const presets = await store.getPresets();
        expect(presets).toHaveLength(1);
    });

    it('merges bookmarks and annotation strokes into existing records without duplicate loops', async () => {
        const store = library('test-import-merge');

        // Existing local score with an existing bookmark
        const existingScore: ScoreFile = {
            id: 'drive-score-123',
            name: 'Moonlight Sonata',
            source: 'google-drive',
            offline: true,
            lastOpened: 1000,
            lastPage: 1,
            bookmarks: [
                { id: 'loop-1', name: 'Exposition Loop', page: 1, type: 'loop', createdAt: 1000 },
            ],
        };
        await store.db.files.put(existingScore);

        // Existing local annotation stroke on page 1
        const existingStroke: AnnotationStroke = {
            id: 'stroke-existing',
            tool: 'highlighter',
            color: '#ffff00',
            size: 10,
            points: [{ x: 0.1, y: 0.1 }],
            createdAt: 1000,
        };
        await store.db.annotations.put({
            fileId: 'drive-score-123',
            pageNumber: 1,
            strokes: [existingStroke],
            updatedAt: 1000,
        });

        // Backup package has duplicate loop-1, a new loop-2, and sampleStroke
        const pkg: ScoreToneExportPackage = {
            version: 1,
            appName: 'scoretone',
            exportedAt: new Date().toISOString(),
            stats: { scoreCount: 1, annotationPageCount: 1, presetCount: 0 },
            scores: [
                {
                    ...sampleScore,
                    bookmarks: [
                        { id: 'loop-1', name: 'Exposition Loop', page: 1, type: 'loop', createdAt: 1000 },
                        { id: 'loop-2', name: 'Development Loop', page: 2, type: 'loop', createdAt: 2000 },
                    ],
                },
            ],
            annotations: [
                {
                    fileId: 'drive-score-123',
                    pageNumber: 1,
                    strokes: [sampleStroke],
                    updatedAt: 2000,
                },
            ],
            customPresets: [],
        };

        const summary = await importLibraryBackup(store.db, pkg);

        expect(summary.scoresImported).toBe(0);
        expect(summary.scoresUpdated).toBe(1);
        expect(summary.annotationPagesUpdated).toBe(1);

        const updatedScore = await store.db.files.get('drive-score-123');
        expect(updatedScore?.offline).toBe(true); // preserved offline state
        expect(updatedScore?.bookmarks).toHaveLength(2); // loop-1 deduplicated, loop-2 added
        expect(updatedScore?.bookmarks?.map(b => b.id)).toEqual(['loop-1', 'loop-2']);

        const updatedPageAnnotations = await store.db.annotations.get(['drive-score-123', 1]);
        expect(updatedPageAnnotations?.strokes).toHaveLength(2); // existingStroke + sampleStroke
        expect(updatedPageAnnotations?.strokes.map(s => s.id)).toContain('stroke-existing');
        expect(updatedPageAnnotations?.strokes.map(s => s.id)).toContain('stroke-1');
        expect(updatedPageAnnotations?.updatedAt).toBe(2000);
    });
});
