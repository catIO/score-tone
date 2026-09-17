import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { GoogleAccountChangedDetail } from './googleDriveService';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'scoretone_google_token';
const EXPIRES_KEY = 'scoretone_google_token_expires';
const PROFILE_KEY = 'scoretone_google_user_profile';
const SESSION_KEY = 'scoretone_google_session_event';
const account = { sub: 'account-a', email: 'a@example.test', name: 'Account A' };

interface OAuthConfig {
    state: string;
    scope: string;
    include_granted_scopes: boolean;
    callback: (response: Record<string, unknown>) => Promise<void>;
    error_callback: (error: { type: string }) => void;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

function jsonResponse(data: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(data) } as unknown as Response;
}

async function expectNoPendingTimers() {
    // jsdom queues zero-delay storage notifications even without another tab.
    // Drain those without advancing to the auth/Picker deadlines under test.
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
}

let service: typeof import('./googleDriveService')['googleDriveService'];
let accountEvent: string;
let oauth: OAuthConfig;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let requestAccessToken: ReturnType<typeof vi.fn>;
let initTokenClient: ReturnType<typeof vi.fn>;
let addListenerSpy: MockInstance<Window['addEventListener']>;

function removeRegisteredListeners() {
    // resetModules does not remove a previous module's module-level storage handler.
    for (const [type, listener, options] of addListenerSpy.mock.calls) {
        window.removeEventListener(type, listener, options);
    }
    addListenerSpy.mockClear();
}

async function importService() {
    removeRegisteredListeners();
    vi.resetModules();
    const module = await import('./googleDriveService');
    service = module.googleDriveService;
    accountEvent = module.GOOGLE_ACCOUNT_CHANGED_EVENT;
}

function tokenResponse(overrides: Record<string, unknown> = {}) {
    return { state: oauth.state, access_token: 'token-a', scope: `${DRIVE_SCOPE} openid`, expires_in: 3600, ...overrides };
}

async function connect(sub = account.sub, token = 'token-a', selectAccount = false) {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...account, sub }));
    const pending = service.getAccessToken({ selectAccount });
    await oauth.callback(tokenResponse({ access_token: token }));
    await expect(pending).resolves.toBe(token);
    return token;
}

beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client');
    vi.stubEnv('VITE_GOOGLE_API_KEY', 'test-api-key');
    vi.stubEnv('VITE_GOOGLE_APP_ID', 'test-app-id');
    vi.stubEnv('VITE_GOOGLE_DRIVE_FOLDER_ID', 'must-not-restrict-to-this-folder');
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(TOKEN_KEY, 'legacy-secret');
    localStorage.setItem(EXPIRES_KEY, String(Date.now() + 3_600_000));
    fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected network request'));
    vi.stubGlobal('fetch', fetchMock);
    requestAccessToken = vi.fn();
    initTokenClient = vi.fn((config: OAuthConfig) => {
        oauth = config;
        return { requestAccessToken };
    });
    vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient } } });
    addListenerSpy = vi.spyOn(window, 'addEventListener');
    await importService();
});

afterEach(() => {
    removeRegisteredListeners();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    localStorage.clear();
    sessionStorage.clear();
});

describe('explicit OAuth and memory-only credentials', () => {
    it('removes legacy credentials without restoring them or requesting credentials on import', () => {
        expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
        expect(localStorage.getItem(EXPIRES_KEY)).toBeNull();
        expect(service.getCachedToken()).toBeNull();
        expect(initTokenClient).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('persists display profile only and loses credentials on module reload', async () => {
        const writes = vi.spyOn(Storage.prototype, 'setItem');
        await connect();
        expect(service.getCachedToken()).toBe('token-a');
        expect(JSON.parse(localStorage.getItem(PROFILE_KEY)!)).toEqual(account);
        expect(writes.mock.calls.some(([key]) => [TOKEN_KEY, EXPIRES_KEY].includes(key))).toBe(false);
        expect(JSON.stringify(writes.mock.calls)).not.toContain('token-a');
        expect(sessionStorage.length).toBe(0);
        await importService();
        expect(service.getCachedToken()).toBeNull();
        expect(service.getUserProfile()).toEqual(account);
        expect(initTokenClient).toHaveBeenCalledTimes(1);
    });

    it('never opens a popup for noninteractive access or silentRefresh', async () => {
        await expect(service.getAccessToken({ allowInteractive: false })).rejects.toThrow(/Reconnect/);
        await expect(service.silentRefresh()).rejects.toThrow(/Reconnect/);
        expect(initTokenClient).not.toHaveBeenCalled();
        expect(requestAccessToken).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('requests only selected-file access with state and awaits a verified sub before resolving', async () => {
        const profileBody = deferred<unknown>();
        fetchMock.mockResolvedValueOnce({ ok: true, json: () => profileBody.promise } as Response);
        const pending = service.getAccessToken();
        const resolved = vi.fn();
        void pending.then(resolved);
        expect(oauth.scope.split(' ')).toContain(DRIVE_SCOPE);
        expect(oauth.scope).not.toMatch(/drive\.readonly|auth\/drive(?:\s|$)/);
        expect(oauth.include_granted_scopes).toBe(false);
        expect(oauth.state).toEqual(expect.any(String));
        expect(oauth.state.length).toBeGreaterThan(0);
        expect(requestAccessToken).toHaveBeenCalledWith({ state: oauth.state });
        const verification = oauth.callback(tokenResponse());
        await Promise.resolve();
        expect(resolved).not.toHaveBeenCalled();
        expect(service.getCachedToken()).toBeNull();
        expect(service.getUserProfile()).toBeNull();
        expect(fetchMock).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: 'Bearer token-a' }, signal: expect.any(AbortSignal),
        });
        profileBody.resolve(account);
        await verification;
        await expect(pending).resolves.toBe('token-a');
        expect(service.getUserProfile()?.sub).toBe(account.sub);
    });

    it.each([
        ['wrong state', { state: 'wrong' }, /state validation/],
        ['missing state', { state: undefined }, /state validation/],
        ['missing grant', { scope: 'openid' }, /not granted/],
        ['broader but wrong grant', { scope: 'https://www.googleapis.com/auth/drive.readonly' }, /not granted/],
        ['missing token', { access_token: '' }, /not granted/],
        ['zero lifetime', { expires_in: 0 }, /invalid token lifetime/],
        ['invalid lifetime', { expires_in: 'NaN' }, /invalid token lifetime/],
    ])('denies %s without a profile request', async (_label, response, error) => {
        const pending = service.getAccessToken();
        const rejected = expect(pending).rejects.toThrow(error);
        await oauth.callback(tokenResponse(response));
        await rejected;
        expect(fetchMock).not.toHaveBeenCalled();
        expect(service.getCachedToken()).toBeNull();
        expect(service.getUserProfile()).toBeNull();
    });

    it.each([null, {}, { email: 'a@example.test' }, { sub: '' }, { sub: '   ' }, { sub: 42 }])(
        'denies a profile without a nonempty string sub: %j', async info => {
            fetchMock.mockResolvedValueOnce(jsonResponse(info));
            const pending = service.getAccessToken();
            const rejected = expect(pending).rejects.toThrow(/valid account identifier/);
            await oauth.callback(tokenResponse());
            await rejected;
            expect(service.getCachedToken()).toBeNull();
            expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
        },
    );

    it('denies a failed profile request', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({}, 403));
        const pending = service.getAccessToken();
        const rejected = expect(pending).rejects.toThrow(/verify your Google account/);
        await oauth.callback(tokenResponse());
        await rejected;
        expect(service.hasToken()).toBe(false);
    });

    it.each([
        ['popup_failed_to_open', /popup blocked/],
        ['popup_closed', /popup closed/],
    ])('handles %s and permits an explicit retry', async (type, message) => {
        const pending = service.getAccessToken();
        const rejected = expect(pending).rejects.toThrow(message);
        oauth.error_callback({ type });
        await rejected;
        await expectNoPendingTimers();
        await connect();
    });

    it('times out auth and ignores a late callback', async () => {
        const pending = service.getAccessToken();
        const rejected = expect(pending).rejects.toThrow(/timed out/);
        await vi.advanceTimersByTimeAsync(120_000);
        await rejected;
        await oauth.callback(tokenResponse());
        expect(fetchMock).not.toHaveBeenCalled();
        expect(service.hasToken()).toBe(false);
    });

    it('coalesces concurrent interactive requests and reuses a valid token noninteractively', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(account));
        const first = service.getAccessToken();
        const second = service.getAccessToken();
        await oauth.callback(tokenResponse());
        await expect(Promise.all([first, second])).resolves.toEqual(['token-a', 'token-a']);
        await expect(service.getAccessToken({ allowInteractive: false })).resolves.toBe('token-a');
        expect(requestAccessToken).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not refresh in the background and rejects expired explicit tokens before any request', async () => {
        await connect();
        fetchMock.mockClear();
        initTokenClient.mockClear();
        requestAccessToken.mockClear();
        await vi.advanceTimersByTimeAsync(3_600_001);
        expect(service.getCachedToken()).toBeNull();
        await expect(service.getAccessToken({ allowInteractive: false })).rejects.toThrow(/Reconnect/);
        await expect(service.silentRefresh()).rejects.toThrow(/Reconnect/);
        await expect(service.listPdfFiles('token-a')).rejects.toThrow(/expired/);
        await expect(service.getFileMetadata('score', 'token-a')).rejects.toThrow(/expired/);
        await expect(service.downloadFile('score', 'token-a')).rejects.toThrow(/expired/);
        await expect(service.openPicker('token-a')).rejects.toThrow(/expired/);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(initTokenClient).not.toHaveBeenCalled();
        expect(requestAccessToken).not.toHaveBeenCalled();
    });
});

describe('account revisions and stale work', () => {
    it('announces initial connection, same-account reconnect, account switch, and logout', async () => {
        const changes: GoogleAccountChangedDetail[] = [];
        window.addEventListener(accountEvent, event => changes.push((event as CustomEvent<GoogleAccountChangedDetail>).detail));
        expect(service.getSessionRevision()).toBe(0);
        await connect();
        expect(changes.at(-1)).toMatchObject({ revision: 1, reason: 'connected', initialConnection: true, previousAccountId: null });
        await vi.advanceTimersByTimeAsync(3_600_001);
        await connect(account.sub, 'token-a2');
        expect(changes.at(-1)).toMatchObject({ revision: 1, reason: 'reconnected', initialConnection: false });
        await connect('account-b', 'token-b', true);
        expect(requestAccessToken).toHaveBeenLastCalledWith({ state: oauth.state, prompt: 'select_account' });
        expect(changes.at(-1)).toMatchObject({ reason: 'account-changed', accountId: 'account-b', previousAccountId: 'account-a', revision: 3 });
        service.logout();
        expect(changes.at(-1)).toMatchObject({ reason: 'logout', accountId: null, revision: 4 });
        expect(service.hasToken()).toBe(false);
        expect(service.getUserProfile()).toBeNull();
        expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
        expect(localStorage.getItem(SESSION_KEY)).toEqual(expect.any(String));
    });

    it.each([PROFILE_KEY, SESSION_KEY, TOKEN_KEY, EXPIRES_KEY, null])('invalidates on cross-tab storage key %s and reads the current profile', async key => {
        await connect();
        localStorage.setItem(PROFILE_KEY, JSON.stringify({ sub: 'account-b' }));
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify({ sub: 'stale-account' }), storageArea: localStorage }));
        expect(service.getSessionRevision()).toBe(2);
        expect(service.getCachedToken()).toBeNull();
        expect(service.getUserProfile()).toEqual({ sub: 'account-b' });
        await expect(service.listPdfFiles('token-a')).rejects.toThrow(/changed or expired/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('ignores unrelated storage and sessionStorage events', async () => {
        await connect();
        window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', storageArea: localStorage }));
        window.dispatchEvent(new StorageEvent('storage', { key: PROFILE_KEY, storageArea: sessionStorage }));
        expect(service.getSessionRevision()).toBe(1);
        expect(service.getCachedToken()).toBe('token-a');
    });

    it('cancels pending auth on logout and ignores a later OAuth callback', async () => {
        const pending = service.getAccessToken();
        const rejected = expect(pending).rejects.toThrow(/session changed/);
        service.logout();
        await rejected;
        await oauth.callback(tokenResponse());
        expect(service.getUserProfile()).toBeNull();
        expect(service.hasToken()).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
        await expectNoPendingTimers();
    });

    it('aborts in-flight profile verification and never restores auth after logout', async () => {
        const response = deferred<Response>();
        fetchMock.mockReturnValueOnce(response.promise);
        const pending = service.getAccessToken();
        const rejected = expect(pending).rejects.toThrow(/session changed/);
        const verification = oauth.callback(tokenResponse());
        const signal = fetchMock.mock.calls[0][1]?.signal;
        service.logout();
        await rejected;
        expect(signal?.aborted).toBe(true);
        response.resolve(jsonResponse(account));
        await verification;
        expect(service.getCachedToken()).toBeNull();
        expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
    });

    it('discards a late listing/401 without clearing the new account token', async () => {
        await connect();
        const response = deferred<Response>();
        fetchMock.mockReturnValueOnce(response.promise);
        const listing = service.listPdfFiles('token-a');
        const rejected = expect(listing).rejects.toThrow(/account changed/);
        await connect('account-b', 'token-b', true);
        response.resolve(jsonResponse({}, 401));
        await rejected;
        expect(service.getCachedToken()).toBe('token-b');
    });
});

describe('authorized score queries and metadata', () => {
    it('escapes search, preserves pagination, and never restricts to a personal folder', async () => {
        await connect();
        fetchMock.mockResolvedValueOnce(jsonResponse({ files: [], nextPageToken: 'next-page' }));
        await expect(service.listPdfFiles('token-a', 'page +/=', "Bach's \\ suite")).resolves.toEqual({ files: [], nextPageToken: 'next-page' });
        const [url, options] = fetchMock.mock.calls.at(-1)!;
        const params = new URL(String(url)).searchParams;
        expect(params.get('q')).toContain("name contains 'Bach\\'s \\\\ suite'");
        expect(params.get('q')).toContain('trashed=false');
        expect(params.get('q')).not.toMatch(/parents|must-not-restrict/);
        expect(params.get('pageToken')).toBe('page +/=');
        expect(params.get('pageSize')).toBe('100');
        expect(params.get('fields')).toContain('nextPageToken');
        expect(options?.headers).toEqual({ Authorization: 'Bearer token-a' });
    });

    it('includes PDF/XML/MusicXML/MXL including generic uploads, and filters unrelated files', async () => {
        await connect();
        const files = [
            { id: 'pdf', name: 'score.PDF', mimeType: 'application/pdf' },
            { id: 'xml', name: 'score.xml', mimeType: 'text/plain' },
            { id: 'musicxml', name: 'score.musicxml', mimeType: 'application/octet-stream' },
            { id: 'mxl', name: 'score.MXL', mimeType: 'application/zip' },
            { id: 'mime', name: 'score', mimeType: 'application/vnd.recordare.musicxml+xml' },
            { id: 'zip', name: 'archive.zip', mimeType: 'application/zip' },
            { id: 'txt', name: 'notes.txt', mimeType: 'text/plain' },
        ];
        fetchMock.mockResolvedValueOnce(jsonResponse({ files }));
        expect((await service.listPdfFiles('token-a')).files.map(file => file.id)).toEqual(['pdf', 'xml', 'musicxml', 'mxl', 'mime']);
    });

    it('retains nextPageToken when a page contains no supported scores', async () => {
        await connect();
        fetchMock.mockResolvedValueOnce(jsonResponse({ files: [{ id: 'txt', name: 'notes.txt' }], nextPageToken: 'more' }));
        await expect(service.listPdfFiles('token-a')).resolves.toEqual({ files: [], nextPageToken: 'more' });
    });

    it.each(['score.pdf', 'score.xml', 'score.musicxml', 'score.mxl'])('returns real metadata for %s', async name => {
        await connect();
        fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'a/b', name, size: '123' }));
        await expect(service.getFileMetadata('a/b', 'token-a')).resolves.toMatchObject({ id: 'a/b', name, size: 123 });
        expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('/files/a%2Fb?');
    });

    it.each([403, 404])('rejects private/inaccessible links (HTTP %s), never fabricating metadata', async status => {
        await connect();
        fetchMock.mockResolvedValueOnce(jsonResponse({}, status));
        await expect(service.getFileMetadata('private', 'token-a')).rejects.toThrow(/Pasting a link does not grant permission/);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([{ id: 'score', name: 'notes.txt' }, { id: 'score' }, { name: 'score.pdf' }])('rejects unsupported/incomplete metadata: %j', async data => {
        await connect();
        fetchMock.mockResolvedValueOnce(jsonResponse(data));
        await expect(service.getFileMetadata('score', 'token-a')).rejects.toThrow(/Select a PDF|incomplete score details/);
    });

    it('clears a token on 401 without requesting another grant', async () => {
        await connect();
        fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
        await expect(service.listPdfFiles('token-a')).rejects.toThrow(/connection expired/);
        expect(service.hasToken()).toBe(false);
        expect(requestAccessToken).toHaveBeenCalledTimes(1);
    });
});

function mockPicker() {
    let callback!: (data: Record<string, unknown>) => void;
    const picker = { setVisible: vi.fn(), dispose: vi.fn() };
    const view = {
        setMimeTypes: vi.fn().mockReturnThis(), setIncludeFolders: vi.fn().mockReturnThis(),
        setSelectFolderEnabled: vi.fn().mockReturnThis(), setMode: vi.fn().mockReturnThis(),
    };
    const builder = {
        addView: vi.fn().mockReturnThis(), setOAuthToken: vi.fn().mockReturnThis(),
        setDeveloperKey: vi.fn().mockReturnThis(), setAppId: vi.fn().mockReturnThis(),
        setOrigin: vi.fn().mockReturnThis(), setTitle: vi.fn().mockReturnThis(),
        setCallback: vi.fn((handler: typeof callback) => { callback = handler; return builder; }),
        build: vi.fn(() => picker),
    };
    window.google.picker = {
        DocsView: vi.fn(() => view), PickerBuilder: vi.fn(() => builder),
        ViewId: { DOCS: 'docs' }, DocsViewMode: { LIST: 'list' },
        Action: { PICKED: 'picked', CANCEL: 'cancel' },
    };
    return { picker, view, builder, emit: (data: Record<string, unknown>) => callback(data) };
}

describe('Picker mock API lifecycle', () => {
    it.each(['cancel', 'error', 'abort', 'logout', 'timeout'])('cleans up on %s', async action => {
        await connect();
        const api = mockPicker();
        const controller = new AbortController();
        const removeWindow = vi.spyOn(window, 'removeEventListener');
        const removeAbort = vi.spyOn(controller.signal, 'removeEventListener');
        const pending = service.openPicker('token-a', controller.signal);
        const outcome = action === 'cancel' || action === 'abort'
            ? expect(pending).resolves.toBeNull()
            : expect(pending).rejects.toThrow(/Picker reported an error|account changed|timed out/);
        await Promise.resolve();
        expect(api.picker.setVisible).toHaveBeenCalledWith(true);
        if (action === 'abort') controller.abort();
        else if (action === 'logout') service.logout();
        else if (action === 'timeout') await vi.advanceTimersByTimeAsync(300_000);
        else api.emit({ action });
        await outcome;
        expect(api.picker.setVisible).toHaveBeenLastCalledWith(false);
        expect(api.picker.dispose).toHaveBeenCalledTimes(1);
        expect(removeWindow).toHaveBeenCalledWith(accountEvent, expect.any(Function));
        expect(removeAbort).toHaveBeenCalledWith('abort', expect.any(Function));
        await expectNoPendingTimers();
        api.emit({ action: 'picked', docs: [{ id: 'late', name: 'late.pdf' }] });
        expect(api.picker.dispose).toHaveBeenCalledTimes(1);
    });

    it.each(['score.pdf', 'score.xml', 'score.musicxml', 'score.mxl'])('selects %s with scoped configuration and disposes', async name => {
        await connect();
        const api = mockPicker();
        const pending = service.openPicker('token-a');
        await Promise.resolve();
        expect(api.builder.setOAuthToken).toHaveBeenCalledWith('token-a');
        expect(api.builder.setAppId).toHaveBeenCalledWith('test-app-id');
        expect(api.builder.setDeveloperKey).toHaveBeenCalledWith('test-api-key');
        expect(api.view.setSelectFolderEnabled).toHaveBeenCalledWith(false);
        expect(api.view.setMimeTypes).toHaveBeenCalledWith(expect.stringContaining('application/zip'));
        api.emit({ action: 'picked', docs: [{ id: 'picked-id', name, sizeBytes: 42 }] });
        await expect(pending).resolves.toMatchObject({ id: 'picked-id', name, size: 42 });
        expect(api.picker.dispose).toHaveBeenCalledTimes(1);
        await expectNoPendingTimers();
    });

    it('rejects unsupported selections and still disposes', async () => {
        await connect();
        const api = mockPicker();
        const pending = service.openPicker('token-a');
        const rejected = expect(pending).rejects.toThrow(/Select a PDF/);
        await Promise.resolve();
        api.emit({ action: 'picked', docs: [{ id: 'txt', name: 'notes.txt' }] });
        await rejected;
        expect(api.picker.dispose).toHaveBeenCalledTimes(1);
    });

    it('settles cancellation even if hiding Picker throws', async () => {
        await connect();
        const api = mockPicker();
        const pending = service.openPicker('token-a');
        await Promise.resolve();
        api.picker.setVisible.mockImplementation(() => { throw new Error('iframe already removed'); });
        api.emit({ action: 'cancel' });
        await expect(pending).resolves.toBeNull();
        expect(api.picker.dispose).toHaveBeenCalledTimes(1);
    });

    it('cleans timers/listeners when the builder throws', async () => {
        await connect();
        const api = mockPicker();
        const remove = vi.spyOn(window, 'removeEventListener');
        api.builder.build.mockImplementation(() => { throw new Error('blocked'); });
        await expect(service.openPicker('token-a')).rejects.toThrow(/could not open/);
        expect(remove).toHaveBeenCalledWith(accountEvent, expect.any(Function));
        await expectNoPendingTimers();
    });
});