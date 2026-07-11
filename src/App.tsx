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

  // Check for shared Google Drive link on mount
  useEffect(() => {
    const handleUrlLink = async () => {
      const params = new URLSearchParams(window.location.search);
      const driveId = params.get('driveId');
      const shareName = params.get('name');

      if (!driveId) return;

      setImporting(true);
      setImportError(null);

      try {
        // Check if file metadata is already in IndexedDB
        const filesList = await storageService.getFiles();
        const existing = filesList.find((f) => f.id === driveId);

        if (existing) {
          // Check if we have the blob cached
          const cachedBlob = await storageService.getFileData(driveId);
          if (cachedBlob) {
            handleOpenFile(existing, cachedBlob);
            setImporting(false);
            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.origin);
            return;
          }
        }

        // File is not cached or is new: fetch from Google Drive
        const blob = await googleDriveService.downloadFile(driveId);
        
        let finalName = shareName || 'Shared Score';
        let size = blob.size;
        
        try {
          const token = await googleDriveService.getAccessToken();
          const driveMeta = await googleDriveService.fetchFileMetadata(driveId, token);
          if (driveMeta.name) {
            finalName = driveMeta.name.replace(/\.pdf$/i, '');
          }
          if (driveMeta.size) {
            size = driveMeta.size;
          }
        } catch (e) {
          console.warn('Could not retrieve metadata, using link defaults', e);
        }

        const newFile: ScoreFile = {
          id: driveId,
          name: finalName,
          source: 'google-drive',
          lastOpened: Date.now(),
          lastPage: 1,
          offline: false,
          size
        };

        // Save metadata to library
        await storageService.saveFileMetadata(newFile);
        
        // Open file immediately
        handleOpenFile(newFile, blob);
        
        // Clear search parameters
        window.history.replaceState({}, document.title, window.location.origin);
      } catch (err: any) {
        console.error('Failed to import shared Google Drive file', err);
        setImportError(err.message || 'Failed to download shared score.');
      } finally {
        setImporting(false);
      }
    };

    handleUrlLink();
  }, []);

  // Save settings whenever they change
  const handleSettingsChange = (newSettings: AppSettings) => {
    setAppSettings(newSettings);
    settingsService.saveSettings(newSettings);
  };

  const handleOpenFile = (file: ScoreFile, blob?: Blob) => {
    setActiveFile(file);
    setInMemoryBlob(blob);
    setActivePage('viewer');
  };

  const handleBackToLibrary = () => {
    setActivePage('library');
    setActiveFile(null);
    setInMemoryBlob(undefined);
  };

  if (importing) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0a0a0c] text-white gap-4">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
        <p className="font-semibold text-sm text-slate-300">Importing shared score from Google Drive...</p>
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
          />
        )
      )}
    </div>
  );
};
export default App;
