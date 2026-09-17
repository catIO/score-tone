import 'fake-indexeddb/auto';
import { useEffect, useState, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useLibraryStorage } from './hooks/useLibraryStorage';
import { createStorageService, type LibraryStorage, type ScoreFile } from './services/storageService';
import {
    googleDriveService, GOOGLE_ACCOUNT_CHANGED_EVENT,
    type GoogleAccountChangedDetail, type GoogleUserProfile,
} from './services/googleDriveService';

type LibraryProps = ComponentProps<typeof import('./components/LibraryPage')['default']>;
type ViewerProps = ComponentProps<typeof import('./components/ViewerPage')['default']>;

const mocks = vi.hoisted(() => ({
    profile: null as GoogleUserProfile | null,
    token: null as string | null,
    revision: 0,
    stores: new Set<LibraryStorage>(),
    reads: [] as Promise<unknown>[],
    libraryMounts: [] as Array<{
        storage: LibraryStorage;
        onOpenFile: LibraryProps['onOpenFile'];
        openDriveOnMount: boolean;
    }>,
    treeMounted: vi.fn(),
    treeUnmounted: vi.fn(),
    viewerUnmounted: vi.fn(),
}));

vi.mock('./services/googleDriveService', () => ({
    GOOGLE_ACCOUNT_CHANGED_EVENT: 'scoretone:google-account-changed',
    googleDriveService: {
        getUserProfile: vi.fn(() => mocks.profile),
        getCachedToken: vi.fn(() => mocks.token),
        hasToken: vi.fn(() => mocks.token !== null),
        getAccessToken: vi.fn(),
        downloadFile: vi.fn(),
    },
}));

// The identity shown in these mocks tracks the connected Google profile, not
// the storage object: storage is a single shared library that never changes,
// while the profile still distinguishes one AccountApp mount/remount from another.
function currentIdentity(): string | null {
    return googleDriveService.getUserProfile()?.sub ?? null;
}

vi.mock('./components/LibraryPage', () => ({
    default: function MockLibraryPage({ onOpenFile, openDriveOnMount = false }: LibraryProps) {
        const storage = useLibraryStorage();
        const [files, setFiles] = useState<ScoreFile[] | null>(null);
        // Deliberately mount-only: changing props without remounting must not open
        // the dialog or reload a different account's files in an old child tree.
        const [showDrive] = useState(() => openDriveOnMount && googleDriveService.hasToken());
        useEffect(() => {
            mocks.stores.add(storage);
            mocks.libraryMounts.push({ storage, onOpenFile, openDriveOnMount });
            let mounted = true;
            mocks.reads.push(storage.getFiles().then(result => {
                if (mounted) setFiles(result);
            }));
            return () => { mounted = false; };
        }, []);
        return (
            <section aria-label="Library">
                <output data-testid="library-account">{currentIdentity() ?? 'device'}</output>
                {files === null ? <p>Loading library</p> : <p>Library ready</p>}
                {files?.map(file => (
                    <button key={file.id} onClick={() => onOpenFile(file)}>Open {file.name}</button>
                ))}
                {showDrive && <div role="dialog" aria-label="Drive browser">{currentIdentity()}</div>}
            </section>
        );
    },
}));

vi.mock('./components/ViewerPage', () => ({
    default: function MockViewerPage({ file, inMemoryBlob, onBack, onPagePermalink }: ViewerProps) {
        const storage = useLibraryStorage();
        const [page, setPage] = useState(file.lastPage);
        const identity = currentIdentity();
        useEffect(() => {
            mocks.stores.add(storage);
            return () => { mocks.viewerUnmounted(identity); };
        }, []);
        return (
            <section aria-label="Viewer">
                <output data-testid="viewer-account">{identity ?? 'device'}</output>
                <p>{file.name}</p>
                <output data-testid="viewer-page">{page}</output>
                <output data-testid="viewer-blob-size">{inMemoryBlob?.size ?? 'none'}</output>
                <button onClick={() => {
                    setPage(page + 1);
                    onPagePermalink?.(page + 1);
                }}>Next page</button>
                <button onClick={onBack}>Back to library</button>
            </section>
        );
    },
}));

vi.mock('./components/UpdatePrompt', () => ({
    default: function MockUpdatePrompt() {
        const storage = useLibraryStorage();
        const identity = currentIdentity();
        // This child stays mounted across library/viewer navigation, so its
        // lifecycle distinguishes an AccountApp remount from a page change.
        useEffect(() => {
            mocks.stores.add(storage);
            mocks.treeMounted(identity);
            return () => { mocks.treeUnmounted(identity); };
        }, []);
        return <output data-testid="account-tree">{identity ?? 'device'}</output>;
    },
}));

const drive = vi.mocked(googleDriveService);
const score = (name: string, id = 'shared-drive-id'): ScoreFile => ({
    id, name, source: 'google-drive', offline: true,
    lastOpened: 1, lastPage: 3,
    bookmarks: [{ id: 'practice', name: 'Practice', page: 3, createdAt: 1 }],
});

// The app always reads/writes the single device library, regardless of which
// Google account (if any) is connected, so tests seed that one library directly.
async function seed(name: string) {
    const storage = createStorageService(null);
    mocks.stores.add(storage);
    const file = score(name);
    await storage.cacheFileOffline(file, new Blob([name]));
    return { storage, file };
}

function latestLibrary() {
    return mocks.libraryMounts[mocks.libraryMounts.length - 1];
}

function accountChange(accountId: string | null, reason: GoogleAccountChangedDetail['reason']) {
    act(() => {
        const previousAccountId = mocks.profile?.sub ?? null;
        mocks.profile = accountId === null ? null : { sub: accountId };
        mocks.token = accountId !== null && reason !== 'storage' ? `token-${accountId}` : null;
        const detail: GoogleAccountChangedDetail = {
            accountId, previousAccountId, profile: mocks.profile,
            reason, revision: ++mocks.revision,
            initialConnection: reason === 'connected' && previousAccountId === null,
        };
        // App consumes the service's normalized event, not the native StorageEvent.
        // Cross-tab localStorage parsing belongs to googleDriveService's own tests.
        window.dispatchEvent(new CustomEvent(GOOGLE_ACCOUNT_CHANGED_EVENT, { detail }));
    });
}

async function expectLibrary(identity: string | null, name: string) {
    await screen.findByRole('button', { name: `Open ${name}` });
    expect(screen.getByTestId('library-account').textContent).toBe(identity ?? 'device');
    expect(screen.queryByRole('region', { name: 'Viewer' })).toBeNull();
}

function expectCleanLocation() {
    expect(window.location.pathname).toBe('/scores');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(window.history.state).toEqual({});
}

beforeEach(async () => {
    vi.clearAllMocks();
    mocks.profile = null;
    mocks.token = null;
    mocks.revision = 0;
    mocks.libraryMounts.length = 0;
    mocks.reads.length = 0;
    // Node structuredClone (used by fake-indexeddb) cannot clone jsdom Blobs.
    // Load through Vitest so this test does not require ambient Node types.
    const { Blob: NodeBlob } = await vi.importActual<{ Blob: typeof Blob }>('node:buffer');
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
    drive.getAccessToken.mockRejectedValue(new Error('No token available offline'));
    drive.downloadFile.mockRejectedValue(new Error('Unexpected Drive download'));
    localStorage.clear();
    window.history.replaceState({}, '', '/scores');
});

afterEach(async () => {
    cleanup();
    await Promise.all(mocks.reads);
    const databases = new Map([...mocks.stores].map(storage => [storage.db.name, storage.db]));
    // Close every connection before deleting each unique database to avoid
    // blocked deletion/versionchange warnings when App and seed share a DB.
    for (const storage of mocks.stores) storage.db.close();
    for (const db of databases.values()) await db.delete();
    mocks.stores.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
});

describe('App single shared library across account changes', () => {
    it('shows the library from a remembered profile without a token or email', async () => {
        await seed('Library score');
        mocks.profile = { sub: 'account-a' };

        render(<App />);

        await expectLibrary('account-a', 'Library score');
        expect(latestLibrary().openDriveOnMount).toBe(false);
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Open Library score' }));
        expect(screen.getByTestId('viewer-account').textContent).toBe('account-a');
        expect(mocks.token).toBeNull();
        expect(drive.getAccessToken).not.toHaveBeenCalled();
        expect(drive.downloadFile).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('opens a cached deep link regardless of the connected account', async () => {
        const { file } = await seed('Library score');
        mocks.profile = { sub: 'account-a' };
        window.history.replaceState({}, '', `/scores?view=${file.id}&page=7`);

        render(<App />);

        await screen.findByRole('region', { name: 'Viewer' });
        expect(screen.getByTestId('viewer-account').textContent).toBe('account-a');
        expect(screen.getByText(file.name)).toBeTruthy();
        expect(screen.getByTestId('viewer-page').textContent).toBe('7');
        expect(screen.getByTestId('viewer-blob-size').textContent).toBe(String(file.name.length));
        expect(mocks.token).toBeNull();
        expect(drive.getAccessToken).not.toHaveBeenCalled();
        expect(drive.downloadFile).not.toHaveBeenCalled();
    });

    it('opens Drive on the first connected account without swapping the library storage', async () => {
        await seed('Library score');
        render(<App />);
        await expectLibrary(null, 'Library score');
        const deviceMount = latestLibrary();
        const oldTree = screen.getByTestId('account-tree');
        expect(screen.queryByRole('dialog')).toBeNull();

        accountChange('account-a', 'connected');

        await expectLibrary('account-a', 'Library score');
        expect(screen.getByRole('dialog', { name: 'Drive browser' }).textContent).toBe('account-a');
        expect(latestLibrary().openDriveOnMount).toBe(true);
        // The same storage instance backs the library before and after connecting.
        expect(latestLibrary().storage).toBe(deviceMount.storage);
        expect(screen.getByTestId('account-tree')).not.toBe(oldTree);
        expect(mocks.treeUnmounted).toHaveBeenCalledWith(null);
        expect(mocks.treeMounted.mock.calls).toEqual([[null], ['account-a']]);
    });

    it('remounts UI state on account switch but keeps the same library contents', async () => {
        await seed('Library score');
        mocks.profile = { sub: 'account-a' };
        render(<App />);
        await expectLibrary('account-a', 'Library score');
        const oldStorage = latestLibrary().storage;
        const oldTree = screen.getByTestId('account-tree');
        fireEvent.click(screen.getByRole('button', { name: 'Open Library score' }));
        expect(window.location.search).toBe('?view=shared-drive-id&page=3');
        window.history.replaceState(window.history.state, '', `${window.location.href}#old-score`);
        const historyLength = window.history.length;

        accountChange('account-b', 'account-changed');

        await expectLibrary('account-b', 'Library score');
        expectCleanLocation();
        expect(window.history.length).toBe(historyLength);
        expect(screen.getByTestId('account-tree')).not.toBe(oldTree);
        expect(mocks.viewerUnmounted.mock.calls).toEqual([['account-a']]);
        expect(mocks.treeUnmounted.mock.calls).toEqual([['account-a']]);
        // The library itself never changes, even though the tree remounted.
        expect(latestLibrary().storage).toBe(oldStorage);
        expect(latestLibrary().openDriveOnMount).toBe(true);
        expect(screen.getByRole('dialog').textContent).toBe('account-b');
        expect(drive.downloadFile).not.toHaveBeenCalled();
    });

    it.each(['logout', 'storage'] as const)('%s returns to the device identity and keeps the library intact', async reason => {
        const { storage, file } = await seed('Library score');
        mocks.profile = { sub: 'account-a' };
        render(<App />);
        await expectLibrary('account-a', 'Library score');
        fireEvent.click(screen.getByRole('button', { name: 'Open Library score' }));

        accountChange(null, reason);

        await expectLibrary(null, 'Library score');
        expectCleanLocation();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(latestLibrary().openDriveOnMount).toBe(false);
        expect(mocks.treeUnmounted.mock.calls).toEqual([['account-a']]);
        expect(mocks.viewerUnmounted.mock.calls).toEqual([['account-a']]);
        expect(await storage.getFiles()).toEqual([file]);
        expect(await (await storage.getFileData(file.id))?.text()).toBe(file.name);

        accountChange('account-a', 'connected');
        await expectLibrary('account-a', 'Library score');
        expectCleanLocation();
    });

    it('selects a non-null cross-tab profile without reopening Drive or losing the library', async () => {
        await seed('Library score');
        mocks.profile = { sub: 'account-a' };
        render(<App />);
        await expectLibrary('account-a', 'Library score');
        fireEvent.click(screen.getByRole('button', { name: 'Open Library score' }));

        accountChange('account-b', 'storage');

        await expectLibrary('account-b', 'Library score');
        expectCleanLocation();
        expect(latestLibrary().openDriveOnMount).toBe(false);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(mocks.treeUnmounted.mock.calls).toEqual([['account-a']]);
        expect(mocks.token).toBeNull();
        expect(drive.getAccessToken).not.toHaveBeenCalled();
    });

    it('keeps the same viewer, local state, storage and history on reconnection', async () => {
        await seed('Library score');
        mocks.profile = { sub: 'account-a' };
        render(<App />);
        await expectLibrary('account-a', 'Library score');
        const originalStorage = latestLibrary().storage;
        fireEvent.click(screen.getByRole('button', { name: 'Open Library score' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        const viewer = screen.getByRole('region', { name: 'Viewer' });
        const tree = screen.getByTestId('account-tree');
        const href = window.location.href;
        const historyState = window.history.state;
        const push = vi.spyOn(window.history, 'pushState');
        const replace = vi.spyOn(window.history, 'replaceState');

        accountChange('account-a', 'reconnected');

        expect(screen.getByRole('region', { name: 'Viewer' })).toBe(viewer);
        expect(screen.getByTestId('account-tree')).toBe(tree);
        expect(screen.getByTestId('viewer-account').textContent).toBe('account-a');
        expect(screen.getByTestId('viewer-page').textContent).toBe('4');
        expect(window.location.href).toBe(href);
        expect(window.history.state).toEqual(historyState);
        expect(push).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
        expect(mocks.treeMounted).toHaveBeenCalledTimes(1);
        expect(mocks.treeUnmounted).not.toHaveBeenCalled();
        expect(mocks.viewerUnmounted).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Back to library' }));
        await expectLibrary('account-a', 'Library score');
        expect(latestLibrary().storage).toBe(originalStorage);
    });

    it.each([
        { accountId: 'account-b', reason: 'account-changed' as const },
        { accountId: 'account-a', reason: 'storage' as const },
    ])('rejects an old onOpenFile after $reason remount to $accountId', async ({ accountId, reason }) => {
        await seed('Library score');
        mocks.profile = { sub: 'account-a' };
        render(<App />);
        await expectLibrary('account-a', 'Library score');
        const oldMount = latestLibrary();
        const oldTree = screen.getByTestId('account-tree');
        fireEvent.click(screen.getByRole('button', { name: 'Open Library score' }));

        accountChange(accountId, reason);

        await expectLibrary(accountId, 'Library score');
        expect(screen.getByTestId('account-tree')).not.toBe(oldTree);
        expect(mocks.treeUnmounted.mock.calls).toEqual([['account-a']]);
        // The revision must remount AccountApp even though the storage object
        // and profile are unchanged; only the old mounted guard rejects this.
        expect(latestLibrary().storage).toBe(oldMount.storage);
        fireEvent.click(screen.getByRole('button', { name: 'Open Library score' }));
        const viewer = screen.getByRole('region', { name: 'Viewer' });
        const href = window.location.href;
        const historyState = window.history.state;
        const historyLength = window.history.length;
        const push = vi.spyOn(window.history, 'pushState');
        const replace = vi.spyOn(window.history, 'replaceState');

        act(() => oldMount.onOpenFile(
            { ...score('Stale score', 'stale-score'), id: 'stale-score' }, new Blob(['stale']), 9, { loop: 'old' },
        ));

        expect(screen.getByRole('region', { name: 'Viewer' })).toBe(viewer);
        expect(screen.getByText('Library score')).toBeTruthy();
        expect(screen.queryByText('Stale score')).toBeNull();
        expect(screen.getByTestId('viewer-account').textContent).toBe(accountId);
        expect(window.location.href).toBe(href);
        expect(window.history.state).toEqual(historyState);
        expect(window.history.length).toBe(historyLength);
        expect(push).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
    });

    it('rejects a mounted old callback when the profile changes before the event is delivered', async () => {
        await seed('Library score');
        mocks.profile = { sub: 'account-a' };
        render(<App />);
        await expectLibrary('account-a', 'Library score');
        const onOpenFile = latestLibrary().onOpenFile;
        const push = vi.spyOn(window.history, 'pushState');

        act(() => {
            mocks.profile = { sub: 'account-b' };
            onOpenFile(score('Stale score'));
        });

        expect(screen.queryByRole('region', { name: 'Viewer' })).toBeNull();
        expect(screen.getByTestId('library-account').textContent).toBe('account-a');
        expectCleanLocation();
        expect(push).not.toHaveBeenCalled();
    });
});