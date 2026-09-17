import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDriveConnection } from './useDriveConnection';
import { googleDriveService, GOOGLE_ACCOUNT_CHANGED_EVENT, GOOGLE_CONNECTION_CHANGED_EVENT } from '../services/googleDriveService';

vi.mock('../services/googleDriveService', () => ({
    GOOGLE_ACCOUNT_CHANGED_EVENT: 'scoretone:google-account-changed',
    GOOGLE_CONNECTION_CHANGED_EVENT: 'scoretone:google-connection-changed',
    googleDriveService: {
        getCachedToken: vi.fn(), getTokenValidityRemainingMs: vi.fn(), getAccessToken: vi.fn(),
    },
}));

const drive = vi.mocked(googleDriveService);
let token: string | null;
let expiresAt: number;

function cache(value: string, remainingMs: number) {
    token = value;
    expiresAt = Date.now() + remainingMs;
}

function dispatch(target: EventTarget, name: string) {
    act(() => { target.dispatchEvent(new Event(name)); });
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
    vi.resetAllMocks();
    token = null;
    expiresAt = 0;
    drive.getCachedToken.mockImplementation(() => token && Date.now() < expiresAt ? token : null);
    drive.getTokenValidityRemainingMs.mockImplementation(() => Math.max(0, expiresAt - Date.now()));
});

afterEach(() => {
    cleanup();
    expect(drive.getAccessToken).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('useDriveConnection passive credential observation', () => {
    it('starts disconnected without scheduling a timer or initiating authentication', () => {
        const { result } = renderHook(() => useDriveConnection());
        expect(result.current).toBeNull();
        expect(drive.getCachedToken).toHaveBeenCalled();
        expect(drive.getTokenValidityRemainingMs).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
        act(() => { vi.advanceTimersByTime(60_000); });
        expect(result.current).toBeNull();
    });

    it('returns the cached token on the first render and expires at the exact service validity boundary', () => {
        cache('cached-token', 12_345);
        const renders: (string | null)[] = [];
        const { result } = renderHook(() => {
            const current = useDriveConnection();
            renders.push(current);
            return current;
        });
        expect(renders[0]).toBe('cached-token');
        expect(result.current).toBe('cached-token');
        expect(drive.getTokenValidityRemainingMs).toHaveBeenCalledTimes(1);
        expect(drive.getTokenValidityRemainingMs).toHaveReturnedWith(12_345);
        expect(vi.getTimerCount()).toBe(1);
        const reads = drive.getCachedToken.mock.calls.length;
        act(() => { vi.advanceTimersByTime(12_344); });
        expect(result.current).toBe('cached-token');
        expect(drive.getCachedToken).toHaveBeenCalledTimes(reads);
        act(() => { vi.advanceTimersByTime(1); });
        expect(result.current).toBeNull();
        expect(drive.getCachedToken).toHaveBeenCalledTimes(reads + 1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not expose an already expired cached credential', () => {
        cache('expired-token', 0);
        const { result } = renderHook(() => useDriveConnection());
        expect(result.current).toBeNull();
        expect(drive.getTokenValidityRemainingMs).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('observes an account reconnect and schedules expiry without remounting', () => {
        const { result } = renderHook(() => useDriveConnection());
        cache('reconnected-token', 7_321);
        dispatch(window, GOOGLE_ACCOUNT_CHANGED_EVENT);
        expect(result.current).toBe('reconnected-token');
        expect(drive.getTokenValidityRemainingMs).toHaveReturnedWith(7_321);
        expect(vi.getTimerCount()).toBe(1);
        act(() => { vi.advanceTimersByTime(7_320); });
        expect(result.current).toBe('reconnected-token');
        act(() => { vi.advanceTimersByTime(1); });
        expect(result.current).toBeNull();
    });

    it('replaces the old expiry timer when an account event supplies a refreshed token', () => {
        cache('old-token', 1_000);
        const { result } = renderHook(() => useDriveConnection());
        act(() => { vi.advanceTimersByTime(400); });
        cache('new-token', 5_123);
        dispatch(window, GOOGLE_ACCOUNT_CHANGED_EVENT);
        expect(result.current).toBe('new-token');
        expect(vi.getTimerCount()).toBe(1);
        const reads = drive.getCachedToken.mock.calls.length;
        act(() => { vi.advanceTimersByTime(600); });
        expect(drive.getCachedToken).toHaveBeenCalledTimes(reads);
        expect(result.current).toBe('new-token');
        act(() => { vi.advanceTimersByTime(4_522); });
        expect(result.current).toBe('new-token');
        act(() => { vi.advanceTimersByTime(1); });
        expect(result.current).toBeNull();
    });

    it.each([GOOGLE_CONNECTION_CHANGED_EVENT, GOOGLE_ACCOUNT_CHANGED_EVENT])('clears credentials and the scheduled timer on invalidation/logout via %s', event => {
        cache('active-token', 9_999);
        const { result } = renderHook(() => useDriveConnection());
        token = null;
        dispatch(window, event);
        expect(result.current).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        const reads = drive.getCachedToken.mock.calls.length;
        act(() => { vi.advanceTimersByTime(20_000); });
        expect(drive.getCachedToken).toHaveBeenCalledTimes(reads);
    });

    it('also observes refreshed credentials delivered by a connection event', () => {
        const { result } = renderHook(() => useDriveConnection());
        cache('connection-token', 4_567);
        dispatch(window, GOOGLE_CONNECTION_CHANGED_EVENT);
        expect(result.current).toBe('connection-token');
        expect(drive.getTokenValidityRemainingMs).toHaveReturnedWith(4_567);
        expect(vi.getTimerCount()).toBe(1);
    });

    it.each(['focus', 'visibilitychange'])('rechecks the cache on %s after suspension and detects refreshed credentials', event => {
        cache('before-suspension', 1_000);
        const { result } = renderHook(() => useDriveConnection());
        // Move the clock without firing timers to model a suspended/backgrounded page.
        vi.setSystemTime(Date.now() + 2_000);
        const target = event === 'focus' ? window : document;
        if (event === 'visibilitychange') vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        dispatch(target, event);
        expect(result.current).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        cache('refreshed-elsewhere', 6_789);
        dispatch(target, event);
        expect(result.current).toBe('refreshed-elsewhere');
        expect(drive.getTokenValidityRemainingMs).toHaveLastReturnedWith(6_789);
        expect(vi.getTimerCount()).toBe(1);
        act(() => { vi.advanceTimersByTime(6_788); });
        expect(result.current).toBe('refreshed-elsewhere');
        act(() => { vi.advanceTimersByTime(1); });
        expect(result.current).toBeNull();
    });

    it.each([0, -20])('uses a minimum 1ms timer if the service reports %s remaining during an expiry race', remaining => {
        drive.getCachedToken.mockReturnValue('racing-token');
        drive.getTokenValidityRemainingMs.mockReturnValue(remaining);
        const { result } = renderHook(() => useDriveConnection());
        expect(result.current).toBe('racing-token');
        drive.getCachedToken.mockReturnValue(null);
        act(() => { vi.advanceTimersByTime(0); });
        expect(result.current).toBe('racing-token');
        act(() => { vi.advanceTimersByTime(1); });
        expect(result.current).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('removes all event listeners and expiry work on unmount, with no OAuth calls afterward', () => {
        const addWindow = vi.spyOn(window, 'addEventListener');
        const removeWindow = vi.spyOn(window, 'removeEventListener');
        const addDocument = vi.spyOn(document, 'addEventListener');
        const removeDocument = vi.spyOn(document, 'removeEventListener');
        cache('cached-token', 10_000);
        const { unmount } = renderHook(() => useDriveConnection());
        expect(vi.getTimerCount()).toBe(1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
        for (const event of [GOOGLE_ACCOUNT_CHANGED_EVENT, GOOGLE_CONNECTION_CHANGED_EVENT, 'focus']) {
            const listener = addWindow.mock.calls.find(([name]) => name === event)?.[1];
            expect(listener).toBeTypeOf('function');
            expect(removeWindow).toHaveBeenCalledWith(event, listener);
        }
        const visibilityListener = addDocument.mock.calls.find(([name]) => name === 'visibilitychange')?.[1];
        expect(visibilityListener).toBeTypeOf('function');
        expect(removeDocument).toHaveBeenCalledWith('visibilitychange', visibilityListener);
        drive.getCachedToken.mockClear();
        drive.getTokenValidityRemainingMs.mockClear();
        cache('post-unmount-token', 30_000);
        for (const event of [GOOGLE_ACCOUNT_CHANGED_EVENT, GOOGLE_CONNECTION_CHANGED_EVENT, 'focus']) dispatch(window, event);
        dispatch(document, 'visibilitychange');
        act(() => { vi.advanceTimersByTime(60_000); });
        expect(drive.getCachedToken).not.toHaveBeenCalled();
        expect(drive.getTokenValidityRemainingMs).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});