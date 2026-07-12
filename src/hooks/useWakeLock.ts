import { useEffect, useRef, useState } from 'react';

interface WakeLockState {
  /** True if a wake lock is currently held */
  isActive: boolean;
  /** True if the Screen Wake Lock API is available in this browser */
  isSupported: boolean;
}

/**
 * Acquires a Screen Wake Lock while `enabled` is true, preventing the device
 * from dimming or locking the screen. Automatically reacquires the lock after
 * the browser releases it on tab visibility changes (required behaviour on iOS
 * and Chrome — the lock is always released when the tab goes to background).
 *
 * Gracefully degrades on browsers that don't support the API.
 */
export function useWakeLock(enabled: boolean): WakeLockState {
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [isActive, setIsActive] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!isSupported || !enabled) {
      // Release any existing lock if the setting is turned off
      if (lockRef.current) {
        lockRef.current.release().catch(() => {});
        lockRef.current = null;
        setIsActive(false);
      }
      return;
    }

    let cancelled = false;

    const acquire = async () => {
      // Don't attempt if tab is hidden — the API will reject it
      if (document.visibilityState !== 'visible') return;
      try {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        lockRef.current = sentinel;
        setIsActive(true);

        // The browser releases the lock when the tab goes to background.
        // Listen for that release so we can reacquire on visibility restore.
        sentinel.addEventListener('release', () => {
          if (!cancelled) setIsActive(false);
        });
      } catch (err: any) {
        // NotAllowedError is expected when tab is not visible; ignore silently.
        if (err?.name !== 'NotAllowedError') {
          console.warn('[ScoreTone] Wake Lock request failed:', err);
        }
        setIsActive(false);
      }
    };

    // Reacquire after the tab becomes visible again (required by the spec).
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled && !lockRef.current) {
        acquire();
      }
    };

    acquire();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (lockRef.current) {
        lockRef.current.release().catch(() => {});
        lockRef.current = null;
        setIsActive(false);
      }
    };
  }, [enabled, isSupported]);

  return { isActive, isSupported };
}
