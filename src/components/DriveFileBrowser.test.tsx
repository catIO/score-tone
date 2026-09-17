import type { ComponentType, ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { googleDriveService, GOOGLE_ACCOUNT_CHANGED_EVENT } from '../services/googleDriveService';
import type { GoogleDriveFileMetadata } from '../services/googleDriveService';

vi.mock('../services/googleDriveService', () => ({
    GOOGLE_ACCOUNT_CHANGED_EVENT: 'scoretone:google-account-changed',
    googleDriveService: {
        listPdfFiles: vi.fn(), getFileMetadata: vi.fn(), openPicker: vi.fn(),
        getSessionRevision: vi.fn(), getAccessToken: vi.fn(),
    },
}));

type Props = ComponentProps<typeof import('./DriveFileBrowser')['DriveFileBrowser']>;
type Listing = Awaited<ReturnType<typeof googleDriveService.listPdfFiles>>;
let DriveFileBrowser: ComponentType<Props>;
const drive = vi.mocked(googleDriveService);
const score = (id: string, name = `${id}.pdf`): GoogleDriveFileMetadata => ({ id, name, size: 1024 });

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

function mount(overrides: Partial<Props> = {}) {
    const props = { token: 'token-a', onSelect: vi.fn(), onClose: vi.fn(), onImportLocal: vi.fn(), ...overrides };
    return { ...render(<DriveFileBrowser {...props} />), props };
}

function search(value: string) {
    const input = screen.getByRole('textbox', { name: 'Search previously authorized scores or paste a Drive link' });
    fireEvent.change(input, { target: { value } });
    fireEvent.submit(input.closest('form')!);
}

beforeAll(async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client');
    ({ DriveFileBrowser } = await import('./DriveFileBrowser'));
    vi.unstubAllEnvs();
});

beforeEach(() => {
    vi.resetAllMocks();
    drive.getSessionRevision.mockReturnValue(1);
    drive.listPdfFiles.mockResolvedValue({ files: [] });
    drive.openPicker.mockResolvedValue(null);
    // Even an accidental use of a real network API must never leave jsdom.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Drive import dialog', () => {
    it('labels the authorized-only list and keeps the primary Picker action mobile-accessible', async () => {
        mount();
        expect(screen.getByRole('dialog', { name: 'Import from Google Drive' }).getAttribute('aria-modal')).toBe('true');
        expect(screen.getByRole('heading', { name: 'Previously authorized scores' })).toBeTruthy();
        expect(screen.getByText(/The list below is not your entire Drive/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Close Drive import' })).toBeTruthy();
        const picker = screen.getByRole('button', { name: 'Select scores with Google Picker' });
        expect(picker.classList.contains('md-btn-filled')).toBe(true);
        expect(picker.classList.contains('min-h-11')).toBe(true);
        // jsdom has no responsive layout: check the DOM/class contract, not pixel visibility.
        for (let node: HTMLElement | null = picker; node; node = node.parentElement) {
            expect(node.hidden).toBe(false);
            expect(node.getAttribute('aria-hidden')).not.toBe('true');
            expect(node.className).not.toMatch(/(?:^|\s)(?:\S+:)?hidden(?:\s|$)/);
        }
        await screen.findByText('No previously authorized scores on this page');
        expect(drive.listPdfFiles).toHaveBeenCalledWith('token-a', undefined, undefined);
        expect(drive.getAccessToken).not.toHaveBeenCalled();
        expect(drive.openPicker).not.toHaveBeenCalled();
    });

    it('closes before invoking local import', async () => {
        const onClose = vi.fn();
        const onImportLocal = vi.fn();
        const { props } = mount({ onClose, onImportLocal });
        await screen.findByText('No previously authorized scores on this page');
        fireEvent.click(screen.getByRole('button', { name: 'Import a device file instead' }));
        expect(props.onClose).toHaveBeenCalledTimes(1);
        expect(props.onImportLocal).toHaveBeenCalledTimes(1);
        expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(onImportLocal.mock.invocationCallOrder[0]);
        expect(props.onSelect).not.toHaveBeenCalled();
    });

    it('explains local import when no local callback is supplied', async () => {
        mount({ onImportLocal: undefined });
        expect(screen.queryByRole('button', { name: 'Import a device file instead' })).toBeNull();
        expect(screen.getByText(/use your library’s local import action/)).toBeTruthy();
        await screen.findByText('No previously authorized scores on this page');
    });

    it.each(['score.pdf', 'score.xml', 'score.musicxml', 'score.mxl'])('selects %s with a single tap and Open Score', async name => {
        const file = score('id', name);
        drive.listPdfFiles.mockResolvedValue({ files: [file] });
        const { props } = mount();
        const open = screen.getByRole('button', { name: 'Open Score' }) as HTMLButtonElement;
        expect(open.disabled).toBe(true);
        fireEvent.click(await screen.findByRole('button', { name: new RegExp(name.replace('.', '\\.')) }));
        expect(open.disabled).toBe(false);
        expect(props.onSelect).not.toHaveBeenCalled();
        fireEvent.click(open);
        expect(props.onSelect).toHaveBeenCalledWith(file);
    });

    it('never fabricates metadata or selects an inaccessible private link', async () => {
        drive.getFileMetadata.mockRejectedValue(new Error('Could not read score details (HTTP 403). Pasting a link does not grant permission.'));
        const { props } = mount();
        await screen.findByText('No previously authorized scores on this page');
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'https://drive.google.com/file/d/private-id/view' } });
        fireEvent.click(screen.getByRole('button', { name: 'Open Link' }));
        expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('HTTP 403'));
        expect(drive.getFileMetadata).toHaveBeenCalledWith('private-id', 'token-a');
        expect(props.onSelect).not.toHaveBeenCalled();
        expect(screen.queryByText('Shared Drive Score')).toBeNull();
        expect(drive.openPicker).not.toHaveBeenCalled();
        expect(drive.getAccessToken).not.toHaveBeenCalled();
    });

    it('opens only metadata actually returned for a link', async () => {
        const file = score('real-id', 'real.mxl');
        drive.getFileMetadata.mockResolvedValue(file);
        const { props } = mount();
        await screen.findByText('No previously authorized scores on this page');
        search('https://drive.google.com/open?id=real-id');
        await waitFor(() => expect(props.onSelect).toHaveBeenCalledWith(file));
    });

    it('ignores old search responses that arrive after the latest results', async () => {
        const old = deferred<Listing>();
        const latest = deferred<Listing>();
        const { props } = mount();
        await screen.findByText('No previously authorized scores on this page');
        drive.listPdfFiles.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
        search('old');
        search('latest');
        await act(async () => latest.resolve({ files: [score('latest')] }));
        expect(screen.getByText('latest.pdf')).toBeTruthy();
        await act(async () => old.resolve({ files: [score('old')], nextPageToken: 'old-page' }));
        expect(screen.queryByText('old.pdf')).toBeNull();
        expect(screen.getByText('latest.pdf')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Load more authorized scores' })).toBeNull();
        expect(props.onSelect).not.toHaveBeenCalled();
    });

    it('pages with the active search, deduplicates IDs, and keeps pagination on empty pages', async () => {
        mount();
        await screen.findByText('No previously authorized scores on this page');
        drive.listPdfFiles.mockResolvedValueOnce({ files: [], nextPageToken: 'page-2' });
        search('suite');
        await screen.findByText('No matching authorized scores on this page');
        drive.listPdfFiles.mockResolvedValueOnce({ files: [score('one')], nextPageToken: 'page-3' });
        fireEvent.click(screen.getByRole('button', { name: 'Load more authorized scores' }));
        await screen.findByText('one.pdf');
        expect(drive.listPdfFiles).toHaveBeenLastCalledWith('token-a', 'page-2', 'suite');
        drive.listPdfFiles.mockResolvedValueOnce({ files: [score('one'), score('two', 'two.mxl')] });
        fireEvent.click(screen.getByRole('button', { name: 'Load more authorized scores' }));
        await screen.findByText('two.mxl');
        expect(screen.getAllByText('one.pdf')).toHaveLength(1);
        expect(drive.listPdfFiles).toHaveBeenLastCalledWith('token-a', 'page-3', 'suite');
        expect(screen.queryByRole('button', { name: 'Load more authorized scores' })).toBeNull();
    });

    it('ignores a pending old page after a new search', async () => {
        drive.listPdfFiles.mockResolvedValueOnce({ files: [score('initial')], nextPageToken: 'old-page' });
        mount();
        await screen.findByText('initial.pdf');
        const oldPage = deferred<Listing>();
        drive.listPdfFiles.mockReturnValueOnce(oldPage.promise).mockResolvedValueOnce({ files: [score('new')] });
        fireEvent.click(screen.getByRole('button', { name: 'Load more authorized scores' }));
        search('new');
        await screen.findByText('new.pdf');
        await act(async () => oldPage.resolve({ files: [score('stale')], nextPageToken: 'stale-page' }));
        expect(screen.queryByText('stale.pdf')).toBeNull();
        expect(screen.queryByText('initial.pdf')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Load more authorized scores' })).toBeNull();
    });

    it('shows expiry guidance without background retries or OAuth', async () => {
        drive.listPdfFiles.mockRejectedValue(new Error('Google Drive connection expired. Reconnect to load previously authorized scores.'));
        mount();
        expect((await screen.findByRole('alert')).textContent).toContain('connection expired');
        expect(drive.listPdfFiles).toHaveBeenCalledTimes(1);
        expect(drive.getAccessToken).not.toHaveBeenCalled();
        expect(drive.openPicker).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('clears visible selections and rejects stale responses on an account revision change', async () => {
        drive.listPdfFiles.mockResolvedValueOnce({ files: [score('old')] });
        const { props } = mount();
        fireEvent.click(await screen.findByRole('button', { name: /old.pdf/ }));
        const pending = deferred<Listing>();
        drive.listPdfFiles.mockReturnValueOnce(pending.promise);
        search('pending');
        act(() => {
            drive.getSessionRevision.mockReturnValue(2);
            window.dispatchEvent(new Event(GOOGLE_ACCOUNT_CHANGED_EVENT));
        });
        expect(screen.getByRole('alert').textContent).toContain('Google account changed');
        await act(async () => pending.resolve({ files: [score('stale')] }));
        expect(screen.queryByText('old.pdf')).toBeNull();
        expect(screen.queryByText('stale.pdf')).toBeNull();
        expect((screen.getByRole('button', { name: 'Open Score' }) as HTMLButtonElement).disabled).toBe(true);
        expect(props.onSelect).not.toHaveBeenCalled();
    });

    it('does not select late link metadata after an account change', async () => {
        const metadata = deferred<GoogleDriveFileMetadata>();
        drive.getFileMetadata.mockReturnValueOnce(metadata.promise);
        const { props } = mount();
        await screen.findByText('No previously authorized scores on this page');
        search('https://drive.google.com/file/d/private-id/view');
        act(() => {
            drive.getSessionRevision.mockReturnValue(2);
            window.dispatchEvent(new Event(GOOGLE_ACCOUNT_CHANGED_EVENT));
        });
        await act(async () => metadata.resolve(score('late')));
        expect(props.onSelect).not.toHaveBeenCalled();
    });

    it('treats Picker cancellation as a no-op and allows reopening', async () => {
        const { props } = mount();
        await screen.findByText('No previously authorized scores on this page');
        fireEvent.click(screen.getByRole('button', { name: 'Select scores with Google Picker' }));
        await screen.findByRole('button', { name: 'Select scores with Google Picker' });
        expect(drive.openPicker).toHaveBeenCalledWith('token-a', expect.any(AbortSignal));
        expect(props.onSelect).not.toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).toBeNull();
        const file = score('picked', 'picked.xml');
        drive.openPicker.mockResolvedValueOnce(file);
        fireEvent.click(screen.getByRole('button', { name: 'Select scores with Google Picker' }));
        await waitFor(() => expect(props.onSelect).toHaveBeenCalledWith(file));
    });

    it('shows actionable Picker errors with local import and dismisses the notice', async () => {
        drive.openPicker.mockRejectedValueOnce(new Error('Google Picker could not open.'));
        mount();
        await screen.findByText('No previously authorized scores on this page');
        fireEvent.click(screen.getByRole('button', { name: 'Select scores with Google Picker' }));
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Google Picker could not open.');
        expect(alert.textContent).toContain('import a file from your device');
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss Picker notice' }));
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('aborts Picker and removes the account listener on unmount, ignoring late selection', async () => {
        const picked = deferred<GoogleDriveFileMetadata | null>();
        drive.openPicker.mockReturnValueOnce(picked.promise);
        const remove = vi.spyOn(window, 'removeEventListener');
        const { props, unmount } = mount();
        await screen.findByText('No previously authorized scores on this page');
        fireEvent.click(screen.getByRole('button', { name: 'Select scores with Google Picker' }));
        const signal = drive.openPicker.mock.calls[0][1]!;
        expect(signal.aborted).toBe(false);
        expect((screen.getByRole('button', { name: 'Google Picker is open or loading…' }) as HTMLButtonElement).disabled).toBe(true);
        unmount();
        expect(signal.aborted).toBe(true);
        expect(remove).toHaveBeenCalledWith(GOOGLE_ACCOUNT_CHANGED_EVENT, expect.any(Function));
        await act(async () => picked.resolve(score('late')));
        expect(props.onSelect).not.toHaveBeenCalled();
    });
});