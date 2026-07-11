import React, { useState, useEffect, useRef } from 'react';
import { FileUp, HardDrive, Trash2, FileText, CheckCircle2, Download, AlertCircle, CloudOff, Wifi } from 'lucide-react';
import { storageService, type ScoreFile } from '../services/storageService';
import { googleDriveService, type GoogleDriveFileMetadata } from '../services/googleDriveService';
import { DriveFileBrowser } from './DriveFileBrowser';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface LibraryPageProps {
  onOpenFile: (file: ScoreFile, inMemoryBlob?: Blob) => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({ onOpenFile }) => {
  const [files, setFiles] = useState<ScoreFile[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'local' | 'drive'>('all');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDriveBrowser, setShowDriveBrowser] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOnline = useNetworkStatus();
  const isGoogleConfigured = googleDriveService.isConfigured();

  useEffect(() => { loadFiles(); }, []);

  const loadFiles = async () => {
    try {
      const allFiles = await storageService.getFiles();
      setFiles(allFiles);
    } catch (e) {
      setErrorMsg('Failed to initialize database.');
    }
  };

  const processLocalFile = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Only PDF files are supported.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const fileId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newFile: ScoreFile = {
        id: fileId,
        name: file.name.replace(/\.pdf$/i, ''),
        source: 'local',
        lastOpened: Date.now(),
        lastPage: 1,
        offline: false,
        size: file.size
      };
      await storageService.saveFileMetadata(newFile);
      await loadFiles();
      setLoading(false);
      onOpenFile(newFile, file);
    } catch (e: any) {
      setErrorMsg('Failed to load PDF.');
      setLoading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length > 0) await processLocalFile(e.dataTransfer.files[0]);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) await processLocalFile(e.target.files[0]);
  };

  const handleGoogleDrivePick = async () => {
    if (!isGoogleConfigured) {
      setErrorMsg('Add VITE_GOOGLE_CLIENT_ID to .env.local to enable Google Drive.');
      return;
    }
    if (!isOnline) {
      setErrorMsg('You must be online to open files from Google Drive.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      await googleDriveService.getAccessToken();
      setShowDriveBrowser(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDriveFileSelected = async (metadata: GoogleDriveFileMetadata) => {
    setShowDriveBrowser(false);
    setLoading(true);
    setErrorMsg(null);
    try {
      const existing = files.find(f => f.id === metadata.id);
      if (existing) {
        existing.lastOpened = Date.now();
        await storageService.saveFileMetadata(existing);
        await loadFiles();
        setLoading(false);
        if (existing.offline) {
          onOpenFile(existing);
        } else {
          const blob = await googleDriveService.downloadFile(existing.id);
          onOpenFile(existing, blob);
        }
        return;
      }
      const newFile: ScoreFile = {
        id: metadata.id,
        name: metadata.name.replace(/\.pdf$/i, ''),
        source: 'google-drive',
        lastOpened: Date.now(),
        lastPage: 1,
        offline: false,
        size: metadata.size,
        thumbnail: metadata.thumbnailLink
      };
      await storageService.saveFileMetadata(newFile);
      await loadFiles();
      const blob = await googleDriveService.downloadFile(newFile.id);
      setLoading(false);
      onOpenFile(newFile, blob);
    } catch (e: any) {
      setErrorMsg('Failed to load from Google Drive: ' + e.message);
      setLoading(false);
    }
  };

  const toggleOfflineCache = async (file: ScoreFile, e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMsg(null);
    if (file.offline) {
      try {
        await storageService.removeFileFromOffline(file.id);
        await loadFiles();
      } catch { setErrorMsg('Failed to remove from cache.'); }
    } else {
      setLoading(true);
      try {
        if (file.source === 'local') {
          setErrorMsg('Open the file in the viewer and click "Save for Offline" to cache local files.');
          setLoading(false);
          return;
        }
        if (!isOnline) {
          setErrorMsg('You must be online to cache Google Drive files.');
          setLoading(false);
          return;
        }
        const blob = await googleDriveService.downloadFile(file.id);
        await storageService.cacheFileOffline(file, blob);
        await loadFiles();
      } catch (err: any) {
        setErrorMsg('Failed to cache: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const deleteFileRecord = async (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Remove this score from your library?')) {
      try {
        await storageService.deleteFile(fileId);
        await loadFiles();
      } catch { setErrorMsg('Failed to remove file.'); }
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const filteredFiles = files.filter(f => {
    if (activeTab === 'local') return f.source === 'local';
    if (activeTab === 'drive') return f.source === 'google-drive';
    return true;
  });

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'local', label: 'Local' },
    { key: 'drive', label: 'Drive' },
  ];

  return (
    <div className="page-container overflow-y-auto" style={{ background: 'var(--md-surface)' }}>
      <div className="max-w-5xl mx-auto w-full px-4 py-6 md:px-8 md:py-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}>
              Score Tone
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--md-on-surface-variant)' }}>
              Digital music stand
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: isOnline ? 'rgba(55,120,60,0.2)' : 'rgba(200,120,0,0.15)',
              color: isOnline ? '#81C784' : 'var(--md-primary)',
            }}>
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
            {isOnline ? 'Online' : 'Offline'}
          </div>
        </div>

        {/* ── Error banner ── */}
        {errorMsg && (
          <div className="flex items-start gap-3 mb-6 p-4 rounded-xl"
            style={{ background: 'var(--md-error-container)', color: 'var(--md-error)' }}>
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="text-sm flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-xs opacity-70 hover:opacity-100 font-semibold">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">

          {/* ── Left panel: add scores ── */}
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--md-on-surface-variant)' }}>
              Add Score
            </p>

            {/* Drop zone */}
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 p-8 rounded-2xl cursor-pointer transition-colors"
              style={{
                border: '2px dashed var(--md-outline-variant)',
                background: 'var(--md-surface-1)',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--md-primary)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--md-outline-variant)')}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="application/pdf" className="hidden" />
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'var(--md-primary-container)' }}>
                <FileUp className="w-5 h-5" style={{ color: 'var(--md-on-primary-container)' }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--md-on-surface)' }}>Drop a PDF here</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--md-on-surface-variant)' }}>or click to browse</p>
              </div>
            </div>

            {/* Google Drive button */}
            {isGoogleConfigured && (
              <button
                onClick={handleGoogleDrivePick}
                disabled={loading || !isOnline}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-semibold transition-colors"
                style={{
                  background: 'var(--md-surface-2)',
                  color: 'var(--md-on-surface)',
                  border: '1px solid var(--md-outline-variant)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--md-surface-2)')}
              >
                {/* Google Drive icon */}
                <svg width="18" height="18" viewBox="0 0 87.3 78" fill="none">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                  <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                  <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                  <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                  <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                  <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                </svg>
                {loading ? 'Connecting…' : 'Open from Google Drive'}
              </button>
            )}

            {loading && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>
                <div className="w-4 h-4 rounded-full border-2 border-transparent animate-spin"
                  style={{ borderTopColor: 'var(--md-primary)' }} />
                Loading…
              </div>
            )}
          </div>

          {/* ── Right panel: library ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--md-on-surface-variant)' }}>
                My Library
              </p>

              {/* Tabs */}
              <div className="flex rounded-full overflow-hidden" style={{ border: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-1)' }}>
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className="px-4 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      background: activeTab === tab.key ? 'var(--md-primary-container)' : 'transparent',
                      color: activeTab === tab.key ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl gap-3"
                style={{ background: 'var(--md-surface-1)', color: 'var(--md-on-surface-variant)' }}>
                <FileText className="w-10 h-10 opacity-30" />
                <p className="text-sm font-medium">No scores yet</p>
                <p className="text-xs opacity-60">Drop a PDF or import from Google Drive</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredFiles.map(file => (
                  <div
                    key={file.id}
                    onClick={() => onOpenFile(file)}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-colors group"
                    style={{ background: 'var(--md-surface-1)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--md-surface-1)')}
                  >
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--md-surface-3)' }}>
                      {file.source === 'google-drive' ? (
                        <svg width="20" height="20" viewBox="0 0 87.3 78" fill="none">
                          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                        </svg>
                      ) : (
                        <HardDrive className="w-5 h-5" style={{ color: 'var(--md-on-surface-variant)' }} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--md-on-surface)' }}>
                        {file.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--md-on-surface-variant)' }}>
                        {[formatSize(file.size), `p.${file.lastPage}`, formatDate(file.lastOpened)].filter(Boolean).join(' · ')}
                      </p>
                    </div>

                    {/* Offline chip */}
                    <div className="flex items-center gap-1">
                      {file.offline ? (
                        <span className="md-chip md-chip-success">
                          <CheckCircle2 className="w-3 h-3" /> Offline
                        </span>
                      ) : (
                        <span className="md-chip md-chip-warning">Online</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => toggleOfflineCache(file, e)}
                        className="md-icon-btn"
                        title={file.offline ? 'Remove offline cache' : 'Save offline'}
                        style={{ width: 32, height: 32 }}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={e => deleteFileRecord(file.id, e)}
                        className="md-icon-btn"
                        title="Remove from library"
                        style={{ width: 32, height: 32 }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showDriveBrowser && (
        <DriveFileBrowser
          onSelect={handleDriveFileSelected}
          onClose={() => setShowDriveBrowser(false)}
        />
      )}
    </div>
  );
};
export default LibraryPage;
