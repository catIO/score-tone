import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

export const UpdatePrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // Periodically check for updates (every 60 minutes)
        const intervalId = setInterval(() => {
          if (navigator.onLine) {
            registration.update().catch(() => {});
          }
        }, 60 * 60 * 1000);

        // Crucial for iPad PWA: check for updates whenever the user switches back to the app
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            registration.update().catch(() => {});
          }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
          clearInterval(intervalId);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
      }
    },
    onRegisterError(error) {
      console.warn('[ScoreTone] Service worker registration failed:', error);
    },
  });

  // Also listen to window online events to check for pending service worker updates
  useEffect(() => {
    const handleOnline = () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
          reg?.update().catch(() => {});
        });
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  if (!needRefresh) return null;

  return (
    <aside
      aria-label="App update available"
      role="alert"
      className="fixed bottom-6 right-6 z-[100] max-w-sm w-[calc(100vw-3rem)] sm:w-80 rounded-2xl p-4 shadow-2xl border flex flex-col gap-3 animate-fade"
      style={{
        background: 'var(--md-surface-3, #2A271F)',
        borderColor: 'var(--md-outline-variant, #4E4540)',
        color: 'var(--md-on-surface, #E8E1D9)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-bold text-sm" style={{ color: 'var(--md-primary, #FFB74D)' }}>
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>Update Available</span>
        </div>
        <button
          onClick={() => setNeedRefresh(false)}
          className="text-slate-400 hover:text-white p-1 -mr-1 -mt-1 rounded-full transition-colors"
          aria-label="Dismiss update notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--md-on-surface-variant, #CEC5B8)' }}>
        A new version of Score Tone is ready. Reload now to get the latest features and fixes.
      </p>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={() => setNeedRefresh(false)}
          className="px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors hover:bg-white/5"
          style={{ color: 'var(--md-on-surface-variant, #CEC5B8)' }}
        >
          Later
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          className="px-4 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md transition-transform active:scale-95"
          style={{
            background: 'var(--md-primary, #FFB74D)',
            color: 'var(--md-on-primary, #3E2000)',
          }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reload & Update</span>
        </button>
      </div>
    </aside>
  );
};

export default UpdatePrompt;
