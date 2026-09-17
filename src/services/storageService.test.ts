import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStorageService, migrateLegacyAccountLibraries, type LibraryStorage, type ScoreFile, type AnnotationStroke } from './storageService';
import { createAnnotationService } from './annotationService';

const opened: LibraryStorage[] = [];
// fake-indexeddb uses Node's structuredClone, which cannot clone jsdom Blobs.
beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
function library(accountId: string | null) {
    const store = createStorageService(accountId);
    opened.push(store);
    return store;
}
const score = (name = 'Score'): ScoreFile => ({
    id: 'same-drive-id', name, source: 'google-drive', offline: true,
    lastOpened: 1, lastPage: 2, zoom: 1.5,
    bookmarks: [{ id: 'bookmark', name: 'Practice', page: 2, createdAt: 1 }],
});
const stroke: AnnotationStroke = {
    id: 'stroke', tool: 'pen', color: '#000', size: 2, points: [{ x: 0.1, y: 0.2 }], createdAt: 1,
};

afterEach(async () => {
    const stores = opened.splice(0);
    for (const store of stores) store.db.close();
    for (const store of stores) await store.db.delete();
    vi.unstubAllGlobals();
});

describe('account-bound offline libraries', () => {
    it('preserves legacy device data without assigning it to the first account', async () => {
        const device = library(null);
        await device.cacheFileOffline(score('Legacy'), new Blob(['device']));
        expect(device.db.name).toBe('ScoreToneDatabase');
        const account = library('google-sub-a');
        expect(await account.getFiles()).toEqual([]);
        expect(await account.getFileData('same-drive-id')).toBeNull();
        expect((await device.getFiles())[0].name).toBe('Legacy');
    });

    it('isolates identical Drive IDs, blobs, bookmarks and annotations between accounts', async () => {
        const a = library('google-sub-a');
        const b = library('google-sub-b');
        await a.cacheFileOffline(score('A'), new Blob(['aaa']));
        await b.cacheFileOffline({ ...score('B'), bookmarks: [] }, new Blob(['bbbbbb']));
        const annotationsA = createAnnotationService(a.db);
        const annotationsB = createAnnotationService(b.db);
        await annotationsA.savePageAnnotations('same-drive-id', 2, [stroke]);
        expect((await a.getFileData('same-drive-id'))?.size).toBe(3);
        expect((await b.getFileData('same-drive-id'))?.size).toBe(6);
        expect((await b.getFiles())[0].bookmarks).toEqual([]);
        expect(await annotationsB.getPageAnnotations('same-drive-id', 2)).toEqual([]);
        expect(await annotationsA.getPageAnnotations('same-drive-id', 2)).toEqual([stroke]);
        await b.deleteFile('same-drive-id');
        expect((await a.getFiles())[0].name).toBe('A');
        expect(await annotationsA.getPageAnnotations('same-drive-id', 2)).toEqual([stroke]);
    });

    it('reopens the same stable identity offline without needing a token or email', async () => {
        const a = library('unchanging-sub');
        await a.cacheFileOffline(score(), new Blob(['score']));
        const reconnect = library('unchanging-sub');
        expect(await reconnect.getFiles()).toEqual([score()]);
        expect((await reconnect.getFileData('same-drive-id'))?.size).toBe(5);
    });

    it('keeps a delayed operation bound to the originating database', async () => {
        const a = library('a');
        const annotations = createAnnotationService(a.db);
        annotations.queueSavePageAnnotations('same-drive-id', 2, [stroke], 1);
        const b = library('b');
        await new Promise(resolve => setTimeout(resolve, 25));
        // Flush explicitly as well so IndexedDB timing is deterministic in CI.
        await annotations.savePageAnnotations('same-drive-id', 2, [stroke]);
        expect(await createAnnotationService(b.db).getPageAnnotations('same-drive-id', 2)).toEqual([]);
        expect(await annotations.getPageAnnotations('same-drive-id', 2)).toEqual([stroke]);
    });

    it('merges metadata without losing practice data and does not save previews', async () => {
        const a = library('a');
        await a.saveFileMetadata({ ...score(), offline: false });
        expect(await a.getFiles()).toEqual([]);
        await a.cacheFileOffline(score(), new Blob(['score']));
        await a.saveFileMetadata({ ...score('Updated'), bookmarks: undefined, zoom: undefined });
        expect((await a.getFiles())[0]).toMatchObject({ name: 'Updated', bookmarks: score().bookmarks, zoom: 1.5 });
        await a.removeFileFromOffline('same-drive-id');
        expect(await a.getFileData('same-drive-id')).toBeNull();
        expect((await a.getFiles())[0].bookmarks).toEqual(score().bookmarks);
    });
});

describe('migrateLegacyAccountLibraries', () => {
    afterEach(() => localStorage.clear());

    it('folds an existing per-account library into the device library once, keeping device-only files', async () => {
        const device = library(null);
        await device.cacheFileOffline(score('Device only'), new Blob(['device']));
        const account = library('google-sub-a');
        await account.cacheFileOffline({ ...score('From account'), id: 'account-only-id' }, new Blob(['account']));
        account.db.close();

        await migrateLegacyAccountLibraries(device.db);

        const files = await device.getFiles();
        expect(files.map(f => f.name).sort()).toEqual(['Device only', 'From account']);
        expect(await (await device.getFileData('account-only-id'))?.text()).toBe('account');
    });

    it('does not overwrite a device file that already exists under the same id', async () => {
        const device = library(null);
        await device.cacheFileOffline(score('Kept device version'), new Blob(['device']));
        const account = library('google-sub-a');
        await account.cacheFileOffline(score('Account version'), new Blob(['account']));
        account.db.close();

        await migrateLegacyAccountLibraries(device.db);

        expect((await device.getFiles())[0].name).toBe('Kept device version');
    });

    it('only migrates once per device, even if called again', async () => {
        const device = library(null);
        const account = library('google-sub-a');
        await account.cacheFileOffline({ ...score('From account'), id: 'account-a-id' }, new Blob(['account']));
        account.db.close();

        await migrateLegacyAccountLibraries(device.db);
        expect(await device.getFiles()).toHaveLength(1);

        // A second per-account database created after migration must not reappear
        // automatically; the migration flag makes this a one-time operation.
        const another = library('google-sub-b');
        await another.cacheFileOffline({ ...score('Should stay put'), id: 'account-b-id' }, new Blob(['b']));
        another.db.close();

        await migrateLegacyAccountLibraries(device.db);
        expect(await device.getFiles()).toHaveLength(1);
    });
});