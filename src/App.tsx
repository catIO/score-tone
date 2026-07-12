import React, { useState, useEffect } from 'react';
import LibraryPage from './components/LibraryPage';
import ViewerPage from './components/ViewerPage';
import { settingsService, type AppSettings } from './services/settingsService';
import { storageService, type ScoreFile } from './services/storageService';
import { googleDriveService } from './services/googleDriveService';
import { Loader2, AlertCircle } from 'lucide-react';

export const App: React.FC = () => {
  const [activePage, setActivePage] = useState<'library' | 'viewer'>('library');
  const [activeFile, setActiveFile] = useState<ScoreFile | null>(null);
  const [inMemoryBlob, setInMemoryBlob] = useState<Blob | undefined>(undefined);
  const [appSettings, setAppSettings] = useState<AppSettings>(settingsService.getSettings());
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

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
          if (googleDriveService.hasToken()) {
            setActiveFile(existing ? { ...existing, ...(linkedPage ? { lastPage: linkedPage } : {}) } : makeFileObj(undefined, false));
            setInMemoryBlob(undefined);
            setActivePage('viewer');
            setPendingLink(null);
          } else {
            setPendingLink({ driveId: targetId, name: existing ? existing.name : name });
          }
        }
      } catch (e) {
        console.error('[ScoreTone] Failed to parse URL parameters', e);
      }
    } else {
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
    setImporting(true);
    setImportError(null);
    setPendingLink(null);

    try {
      // Check if we already have this file cached
      const filesList = await storageService.getFiles();
      const existing = filesList.find((f) => f.id === driveId);
      if (existing) {
        const cachedBlob = await storageService.getFileData(driveId);
        if (cachedBlob) {
          handleOpenFile(existing, cachedBlob);
          setImporting(false);
          return;
        }
      }

      // Triggers OAuth popup
      const blob = await googleDriveService.downloadFile(driveId);

      const newFile: ScoreFile = {
        id: driveId,
        name: shareName.replace(/\.pdf$/i, ''),
        source: 'google-drive',
        lastOpened: Date.now(),
        lastPage: 1,
        offline: false,
        size: blob.size
      };

      await storageService.saveFileMetadata(newFile);
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
    settingsService.saveSettings(newSettings);
  };

  const handleOpenFile = (file: ScoreFile, blob?: Blob, page?: number) => {
    const fileToOpen = page ? { ...file, lastPage: page } : file;
    setActiveFile(fileToOpen);
    setInMemoryBlob(blob);
    setActivePage('viewer');

    // Update URL to reflect the current view, including page if specified
    const params = new URLSearchParams(window.location.search);
    const pageToWrite = page ?? file.lastPage;
    const newUrl = pageToWrite && pageToWrite > 1
      ? `?view=${file.id}&page=${pageToWrite}`
      : `?view=${file.id}`;
    if (params.get('view') !== file.id || params.get('page') !== String(pageToWrite ?? '')) {
      window.history.pushState(
        { page: 'viewer', fileId: file.id, filePage: pageToWrite },
        '',
        newUrl
      );
    }
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
    setActivePage('library');
    setActiveFile(null);
    setInMemoryBlob(undefined);

    // Update URL history to main library path
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') || params.get('driveId')) {
      window.history.pushState({ page: 'library' }, '', window.location.origin);
    }
  };

  // Loading spinner while downloading PWA assets or importing
  if (importing) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0a0a0c] text-white gap-4">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
        <p className="font-semibold text-sm text-slate-300">Importing shared score from Google Drive…</p>
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
            <path d="M500-360q42 0 71-29t29-71v-220h120v-80H560v220q-13-10-28-15t-32-5q-42 0-71 29t-29 71q0 42 29 71t71 29ZM320-240q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320Zm0-80h480v-480H320v480ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm160-720v480-480Z"/>
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
            Sign in with Google to continue.
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
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
          <button
            onClick={() => setPendingLink(null)}
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
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-sm flex items-start gap-3 max-w-md">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-rose-300">Link Import Failed</p>
            <p className="text-xs mt-1">{importError}</p>
            <button
              onClick={() => setImportError(null)}
              className="mt-2 text-xs font-bold text-rose-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {activePage === 'library' ? (
        <LibraryPage onOpenFile={handleOpenFile} />
      ) : (
        activeFile && (
          <ViewerPage
            file={activeFile}
            inMemoryBlob={inMemoryBlob}
            onBack={handleBackToLibrary}
            appSettings={appSettings}
            onSettingsChange={handleSettingsChange}
            onPagePermalink={(page) => handleViewerPageChange(activeFile.id, page)}
            onFileMetadataUpdated={handleOpenFile}
          />
        )
      )}
    </div>
  );
};
export default App;
