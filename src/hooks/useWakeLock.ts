import { useEffect, useRef, useState } from 'react';

interface WakeLockState {
  /** True if a wake lock is currently held */
  isActive: boolean;
  /** True if the Screen Wake Lock API is available in this browser */
  isSupported: boolean;
}

// Module-level tracker for any active wake lock sentinel across the app.
// Ensures we can forcefully release any held wake lock when exiting the score viewer or going to background.
let globalSentinel: WakeLockSentinel | null = null;

/**
 * Forcefully releases any active screen wake lock held by the app.
 * Can be called when leaving the score viewer or entering the library.
 */
export async function forceReleaseWakeLock(): Promise<void> {
  if (globalSentinel) {
    const sentinel = globalSentinel;
    globalSentinel = null;
    try {
      await sentinel.release();
    } catch {
      // Ignore errors if already released
    }
  }
}

// Global safety listener: release lock if entire window/page hides or unloads
if (typeof window !== 'undefined') {
  (window as any).releaseWakeLock = forceReleaseWakeLock;
  window.addEventListener('pagehide', () => {
    forceReleaseWakeLock().catch(() => {});
  });
}

/**
 * Acquires a Screen Wake Lock ONLY while:
 * 1. A score is actively open (inside ViewerPage)
 * 2. The setting is enabled
 * 3. The page is in the foreground and active (document.visibilityState === 'visible')
 *
 * Automatically and immediately releases the lock whenever the page goes into the background
 * (switching tabs, minimizing, switching apps on mobile/tablet) or when navigating back to the library.
 */
export function useWakeLock(enabled: boolean): WakeLockState {
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [isActive, setIsActive] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!isSupported || !enabled) {
      if (lockRef.current) {
        lockRef.current.release().catch(() => {});
        lockRef.current = null;
      }
      if (globalSentinel) {
        globalSentinel.release().catch(() => {});
        globalSentinel = null;
      }
      setIsActive(false);
      return;
    }

    let cancelled = false;
    let acquiring = false;

    const releaseLock = async () => {
      const sentinels = [lockRef.current, globalSentinel].filter(Boolean) as WakeLockSentinel[];
      lockRef.current = null;
      globalSentinel = null;
      setIsActive(false);
      for (const sentinel of sentinels) {
        try {
          await sentinel.release();
        } catch {
          // Ignore
        }
      }
    };

    const acquire = async () => {
      if (cancelled || acquiring) return;
      // Do not acquire if document is hidden / in the background
      if (document.visibilityState !== 'visible' || document.hidden) return;

      // Release any existing lock before requesting a new one
      if (lockRef.current || globalSentinel) {
        await releaseLock();
      }

      if (cancelled || document.visibilityState !== 'visible' || document.hidden) return;
      acquiring = true;

      try {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        // If cancelled or page went to background while request was pending, release immediately
        if (cancelled || document.visibilityState !== 'visible' || document.hidden) {
          sentinel.release().catch(() => {});
          return;
        }

        lockRef.current = sentinel;
        globalSentinel = sentinel;
        setIsActive(true);

        // When the browser or system releases the lock (e.g. tab switched or backgrounded):
        sentinel.addEventListener('release', () => {
          if (lockRef.current === sentinel) {
            lockRef.current = null;
          }
          if (globalSentinel === sentinel) {
            globalSentinel = null;
          }
          if (!cancelled) {
            setIsActive(false);
          }
        });
      } catch (err: any) {
        // NotAllowedError is expected when tab is not visible
        if (err?.name !== 'NotAllowedError') {
          console.warn('[ScoreTone] Wake Lock request failed:', err);
        }
        setIsActive(false);
      } finally {
        acquiring = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !document.hidden) {
        // Page became active and visible in foreground
        if (enabled && !lockRef.current && !cancelled) {
          acquire();
        }
      } else {
        // Page moved to the background: immediately release wake lock
        releaseLock().catch(() => {});
      }
    };

    const handlePageHide = () => {
      releaseLock().catch(() => {});
    };

    // Only acquire if currently visible and active
    if (document.visibilityState === 'visible' && !document.hidden) {
      acquire();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      releaseLock().catch(() => {});
    };
  }, [enabled, isSupported]);

  return { isActive, isSupported };
}
