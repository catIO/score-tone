import React, { useState, useEffect, useMemo, useRef } from 'react';
import LibraryPage from './components/LibraryPage';
import ViewerPage from './components/ViewerPage';
import { settingsService, type AppSettings } from './services/settingsService';
import { createStorageService, migrateLegacyAccountLibraries, type ScoreFile } from './services/storageService';
import { googleDriveService, GOOGLE_ACCOUNT_CHANGED_EVENT, type GoogleAccountChangedDetail } from './services/googleDriveService';
import { LibraryStorageContext, useLibraryStorage } from './hooks/useLibraryStorage';
import { Loader2, AlertCircle, X } from 'lucide-react';
import UpdatePrompt from './components/UpdatePrompt';
import { forceReleaseWakeLock } from './hooks/useWakeLock';

export const App: React.FC = () => {
  const [session, setSession] = useState(() => ({
    accountId: googleDriveService.getUserProfile()?.sub ?? null,
    revision: 0,
    openDrive: false,
  }));
  // A single shared library is used regardless of which Google account is
  // connected; Drive accounts only affect what can be imported, never storage.
  const storage = useMemo(() => createStorageService(null), []);

  useEffect(() => {
    void migrateLegacyAccountLibraries(storage.db);
  }, [storage]);

  useEffect(() => {
    const onAccountChange = (event: Event) => {
      const detail = (event as CustomEvent<GoogleAccountChangedDetail>).detail;
      if (detail.reason === 'reconnected') return;
      // Never replay the previous user's deep link after switching/logout.
      if (!detail.initialConnection) window.history.replaceState({}, '', window.location.pathname);
      forceReleaseWakeLock().catch(() => { });
      setSession({
        accountId: detail.accountId, revision: detail.revision,
        openDrive: detail.initialConnection || detail.reason === 'account-changed'
      });
    };
    window.addEventListener(GOOGLE_ACCOUNT_CHANGED_EVENT, onAccountChange);
    return () => window.removeEventListener(GOOGLE_ACCOUNT_CHANGED_EVENT, onAccountChange);
  }, []);

  return (
    <LibraryStorageContext.Provider value={storage}>
      <AccountApp
        key={`${session.accountId ?? 'device'}:${session.revision}`}
        accountId={session.accountId}
        openDriveOnMount={session.openDrive}
      />
    </LibraryStorageContext.Provider>
  );
};

const AccountApp: React.FC<{ accountId: string | null; openDriveOnMount: boolean }> = ({ accountId, openDriveOnMount }) => {
  const storageService = useLibraryStorage();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // The library itself never changes with the account, but this mount still
  // represents a specific account; reject stale work once the active Google
  // profile no longer matches it, even before an unmount/remount occurs.
  const isCurrentLibrary = () => mounted.current && accountId === (googleDriveService.getUserProfile()?.sub ?? null);
  const [activePage, setActivePage] = useState<'library' | 'viewer'>('library');
  const [activeFile, setActiveFile] = useState<ScoreFile | null>(null);
  const [inMemoryBlob, setInMemoryBlob] = useState<Blob | undefined>(undefined);
  const [appSettings, setAppSettings] = useState<AppSettings>(settingsService.getSettings());
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return appSettings.theme || settingsService.getTheme() || 'dark';
  });
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [silentAuthPending, setSilentAuthPending] = useState(false);

  // Sync theme attribute & class with document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const handleToggleTheme = () => {
    const nextTheme: 'dark' | 'light' = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    const updated: AppSettings = { ...appSettings, theme: nextTheme };
    setAppSettings(updated);
    settingsService.saveSettings(updated);
  };

  // Pending deep-link: stored until user clicks a button (needed for popup unblock)
  const [pendingLink, setPendingLink] = useState<{ driveId: string; name: string } | null>(null);

  // Parse location and sync UI state with URL parameters
  const syncStateWithUrl = async () => {
    const params = new URLSearchParams(window.location.search);
    const viewId = params.get('view');
    const driveId = params.get('driveId');
    const name = params.get('name') || 'Shared Score';
    const pageParam = params.get('page');
    const linkedPage = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : null;

    const targetId = viewId || driveId;

    if (targetId) {
      try {
        const filesList = await storageService.getFiles();
        const existing = filesList.find((f) => f.id === targetId);
        const cachedBlob = await storageService.getFileData(targetId);
        if (!isCurrentLibrary()) return;
        if (!existing && targetId.startsWith('local-')) {
          setImportError('This local score is not in your library on this device. Import the file to open it here.');
          return;
        }

        // Build the file object, overriding lastPage if a page param was provided
        const makeFileObj = (base: typeof existing, offline: boolean) => ({
          id: targetId,
          name,
          source: 'google-drive' as const,
          lastOpened: Date.now(),
          lastPage: linkedPage ?? (base?.lastPage ?? 1),
          offline,
          ...(base ?? {}),
          // page param always wins over stored lastPage for deep-link navigation
          ...(linkedPage ? { lastPage: linkedPage } : {}),
        });

        if (cachedBlob) {
          setActiveFile(existing ? { ...existing, ...(linkedPage ? { lastPage: linkedPage } : {}) } : makeFileObj(undefined, true));
          setInMemoryBlob(cachedBlob);
          setActivePage('viewer');
          setPendingLink(null);
        } else {
          // No cached blob - we must download the file from Google Drive.
          // Show the loader during token acquisition and download.
          setSilentAuthPending(true);
          try {
            // Reuse a valid in-memory token only; never trigger background auth.
            let token: string | undefined;
            try {
              token = await googleDriveService.getAccessToken({ allowInteractive: false });
            } catch {
              // No valid stored token — downloadFile will attempt unauthenticated public download
            }

            // Download the file using token if available, or via public download strategies
            const blob = await googleDriveService.downloadFile(targetId, token);
            if (!isCurrentLibrary()) return;

            // If the user already has this score in their library, refresh cache & metadata.
            // Otherwise, open it in memory preview mode without automatically saving to library.
            let fileToOpen: ScoreFile;
            if (existing) {
              fileToOpen = { ...existing, lastOpened: Date.now(), offline: true, size: blob.size, ...(linkedPage ? { lastPage: linkedPage } : {}) };
              await storageService.cacheFileOffline(fileToOpen, blob);
            } else {
              fileToOpen = {
                id: targetId,
                name: name.replace(/\.(pdf|xml|musicxml|mxl)$/i, ''),
                source: 'google-drive',
                fileType: /\.(xml|musicxml|mxl)$/i.test(name) ? 'musicxml' : 'pdf',
                lastOpened: Date.now(),
                lastPage: linkedPage ?? 1,
                offline: false,
                size: blob.size,
              };
            }

            setActiveFile(fileToOpen);
            setInMemoryBlob(blob);
            setActivePage('viewer');
            setPendingLink(null);
          } catch (err: any) {
            if (!isCurrentLibrary()) return;
            console.warn('[ScoreTone] Deep link download failed:', err);
            // The Drive service invalidates only the failed token; an expired
            // connection must not disconnect/hide the selected offline library.
            // Fall back to showing the user-gesture sign-in gate
            setPendingLink({ driveId: targetId, name: existing ? existing.name : name });
          } finally {
            setSilentAuthPending(false);
          }
        }
      } catch (e) {
        console.error('[ScoreTone] Failed to parse URL parameters', e);
      }
    } else {
      forceReleaseWakeLock().catch(() => { });
      setActivePage('library');
      setActiveFile(null);
      setInMemoryBlob(undefined);
      setPendingLink(null);
    }
  };

  // Sync state on initial mount & listen to back/forward navigation
  useEffect(() => {
    syncStateWithUrl();

    const handlePopState = () => {
      syncStateWithUrl();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const importSharedScore = async (driveId: string, shareName: string) => {
    setImportError(null);

    try {
      // 1. Get the token FIRST, synchronously within the click event!
      // This ensures that the popup is opened directly from the user's click gesture.
      const token = await googleDriveService.getAccessToken();
      if (!isCurrentLibrary()) return; // The new account tree resumes the deep link.

      // Only set importing and clear pending link after we successfully got the token
      setImporting(true);
      setPendingLink(null);

      // 2. Check if we already have this file cached
      const filesList = await storageService.getFiles();
      const existing = filesList.find((f) => f.id === driveId);
      if (existing) {
        const cachedBlob = await storageService.getFileData(driveId);
        if (cachedBlob) {
          handleOpenFile(existing, cachedBlob);
          return;
        }
      }

      // 3. Download the file using the token we already fetched.
      // Use an AbortController so a stalled network fetch doesn't spin forever.
      const controller = new AbortController();
      const downloadTimeout = setTimeout(() => controller.abort(), 2 * 60 * 1000);
      let blob: Blob;
      try {
        blob = await googleDriveService.downloadFile(driveId, token, controller.signal);
      } finally {
        clearTimeout(downloadTimeout);
      }

      const newFile: ScoreFile = {
        ...existing,
        id: driveId,
        name: shareName.replace(/\.(pdf|xml|musicxml|mxl)$/i, ''),
        source: 'google-drive',
        fileType: /\.(xml|musicxml|mxl)$/i.test(shareName) ? 'musicxml' : 'pdf',
        lastOpened: Date.now(),
        lastPage: existing?.lastPage ?? 1,
        offline: Boolean(existing?.offline),
        size: blob.size,
        ...(existing?.bookmarks ? { bookmarks: existing.bookmarks } : {})
      };

      if (existing) {
        await storageService.cacheFileOffline(newFile, blob);
      }
      handleOpenFile(newFile, blob);
    } catch (err: any) {
      console.error('Failed to import shared Google Drive file', err);
      setImportError(err.message || 'Failed to download shared score.');
    } finally {
      setImporting(false);
    }
  };

  const handleSettingsChange = (newSettings: AppSettings) => {
    setAppSettings(newSettings);
    if (newSettings.theme && newSettings.theme !== theme) {
      setTheme(newSettings.theme);
    }
    settingsService.saveSettings(newSettings);
  };

  const handleOpenFile = (file: ScoreFile, blob?: Blob, page?: number, queryParams?: Record<string, string>) => {
    if (!isCurrentLibrary()) return;
    const fileToOpen = page ? { ...file, lastPage: page } : file;
    setActiveFile(fileToOpen);
    setInMemoryBlob(blob);
    setActivePage('viewer');

    // Update URL to reflect the current view, including page and loop parameters if specified
    const pageToWrite = page ?? file.lastPage;
    const urlParams = new URLSearchParams();
    urlParams.set('view', file.id);
    if (pageToWrite && pageToWrite > 1) {
      urlParams.set('page', String(pageToWrite));
    }
    if (queryParams) {
      Object.entries(queryParams).forEach(([k, v]) => {
        if (v !== undefined && v !== '') {
          urlParams.set(k, v);
        }
      });
    }

    const newUrl = `?${urlParams.toString()}`;
    window.history.pushState(
      { page: 'viewer', fileId: file.id, filePage: pageToWrite },
      '',
      newUrl
    );
  };

  const handleFileMetadataUpdated = (updatedFile: ScoreFile) => {
    setActiveFile(updatedFile);
  };

  // Called by ViewerPage when the user turns a page — keeps the URL in sync
  // so the current URL is always a valid permalink to the exact position.
  const handleViewerPageChange = (fileId: string, page: number) => {
    const newUrl = page > 1 ? `?view=${fileId}&page=${page}` : `?view=${fileId}`;
    window.history.replaceState(
      { page: 'viewer', fileId, filePage: page },
      '',
      newUrl
    );
  };

  const handleBackToLibrary = () => {
    // Explicitly release screen wake lock whenever exiting the score viewer
    forceReleaseWakeLock().catch(() => { });
    setActivePage('library');
    setActiveFile(null);
    setInMemoryBlob(undefined);

    // Update URL history to main library path
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') || params.get('driveId')) {
      window.history.pushState({ page: 'library' }, '', window.location.origin);
    }
  };

  // Guarantee that wake lock is strictly released whenever the user is on the library page
  useEffect(() => {
    if (activePage === 'library') {
      forceReleaseWakeLock().catch(() => { });
    }
  }, [activePage]);

  // Loading spinner while downloading PWA assets or importing
  if (importing || silentAuthPending) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0a0a0c] text-white gap-4">
        <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
        <p className="font-semibold text-sm text-slate-300">
          {silentAuthPending ? 'Opening score…' : 'Importing shared score from Google Drive…'}
        </p>
      </div>
    );
  }

  // Deep-link sign-in gate
  if (pendingLink) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center px-6 gap-8"
        style={{ background: 'var(--md-surface)', color: 'var(--md-on-surface)' }}>

        {/* App Logo */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-black"
          style={{ border: '1px solid var(--md-outline-variant)' }}>
          <svg viewBox="0 -960 960 960" className="w-9 h-9" fill="#ffffff">
            <path d="M500-360q42 0 71-29t29-71v-220h120v-80H560v220q-13-10-28-15t-32-5q-42 0-71 29t-29 71q0 42 29 71t71 29ZM320-240q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320Zm0-80h480v-480H320v480ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm160-720v480-480Z" />
          </svg>
        </div>

        {/* Text */}
        <div className="text-center max-w-xs">
          <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--md-on-surface)' }}>
            Open Shared Score
          </h1>
          <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>
            You were shared:{' '}
            <span className="font-semibold" style={{ color: 'var(--md-on-surface)' }}>"{pendingLink.name}"</span>
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--md-on-surface-variant)' }}>
            Reconnect to open an authorized score. Private files may need to be selected with Google Picker from the library first.
          </p>
        </div>

        {importError && (
          <div className="rounded-xl p-4 text-sm max-w-sm w-full"
            style={{ background: 'var(--md-error-container)', color: 'var(--md-error)' }}>
            {importError}
          </div>
        )}

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => importSharedScore(pendingLink.driveId, pendingLink.name)}
            className="md-btn-filled w-full py-3 flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
          <button
            onClick={() => {
              setPendingLink(null);
              // Clean up the URL query params so they aren't stuck on the deep-linked URL
              const params = new URLSearchParams(window.location.search);
              if (params.get('view') || params.get('driveId')) {
                window.history.pushState({ page: 'library' }, '', window.location.origin);
              }
            }}
            className="md-btn-text w-full py-2 text-sm"
          >
            Go to Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {importError && (
        <div
          role="alert"
          className="fixed bottom-6 inset-x-4 sm:inset-x-auto sm:right-6 sm:w-[440px] z-50 p-4 rounded-2xl shadow-2xl flex items-start gap-3.5 animate-fade border"
          style={{
            background: 'var(--md-surface-2)',
            borderColor: 'rgba(244, 63, 94, 0.4)',
            boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.7), 0 0 16px -2px rgba(244, 63, 94, 0.15)',
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185' }}
          >
            <AlertCircle className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0 pr-1">
            <h4
              className="text-sm font-bold tracking-tight text-white mb-1"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Link Import Failed
            </h4>
            <p className="text-xs leading-relaxed text-zinc-300 font-normal">
              {importError}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => setImportError(null)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors hover:bg-white/10 active:scale-95"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  borderColor: 'rgba(255, 255, 255, 0.12)',
                  color: 'var(--md-on-surface)',
                }}
              >
                Dismiss
              </button>
            </div>
          </div>

          <button
            onClick={() => setImportError(null)}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activePage === 'library' ? (
        <LibraryPage
          settings={appSettings}
          onSettingsChange={handleSettingsChange}
          openDriveOnMount={openDriveOnMount}
          onOpenFile={handleOpenFile}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
      ) : (
        activeFile && (
          <ViewerPage
            file={activeFile}
            inMemoryBlob={inMemoryBlob}
            onBack={handleBackToLibrary}
            appSettings={appSettings}
            onSettingsChange={handleSettingsChange}
            onPagePermalink={(page) => handleViewerPageChange(activeFile.id, page)}
            onFileMetadataUpdated={handleFileMetadataUpdated}
          />
        )
      )}

      <UpdatePrompt />
    </div>
  );
};
export default App;
