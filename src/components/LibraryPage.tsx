import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileUp, HardDrive, Trash2, FileText, CheckCircle2, Download, AlertCircle, CloudOff, Wifi, X } from 'lucide-react';
import { storageService, type ScoreFile } from '../services/storageService';
import { googleDriveService, type GoogleDriveFileMetadata } from '../services/googleDriveService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface LibraryPageProps {
  onOpenFile: (file: ScoreFile, inMemoryBlob?: Blob, page?: number) => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({ onOpenFile }) => {
  const [files, setFiles] = useState<ScoreFile[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'local' | 'drive'>('all');
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false); // true only during Drive auth + picker
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(
    () => googleDriveService.getCachedToken()
  );
  const [showAboutModal, setShowAboutModal] = useState(false);
  // Share dropdown state: tracks which card's menu is open and which item was just copied
  const [openShareId, setOpenShareId] = useState<string | null>(null);
  const [copiedState, setCopiedState] = useState<{ id: string; type: 'score' | 'page' } | null>(null);
  const shareMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOnline = useNetworkStatus();
  const isGoogleConfigured = googleDriveService.isConfigured();

  // Close open share menu when clicking outside any card's dropdown
  useEffect(() => {
    if (!openShareId) return;
    const handler = (e: MouseEvent) => {
      const menuEl = shareMenuRefs.current.get(openShareId);
      if (menuEl && !menuEl.contains(e.target as Node)) {
        setOpenShareId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openShareId]);

  // Build share URLs for a card (same scheme as ViewerToolbar)
  const getScoreLinkUrl = useCallback((file: ScoreFile) =>
    file.source === 'google-drive'
      ? `${window.location.origin}/?driveId=${file.id}&name=${encodeURIComponent(file.name)}`
      : `${window.location.origin}/?view=${file.id}`
    , []);

  const getPageLinkUrl = useCallback((file: ScoreFile) =>
    file.lastPage > 1
      ? `${window.location.origin}/?view=${file.id}&page=${file.lastPage}`
      : `${window.location.origin}/?view=${file.id}`
    , []);

  const handleCopyScoreLink = (file: ScoreFile, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getScoreLinkUrl(file)).then(() => {
      setCopiedState({ id: file.id, type: 'score' });
      setTimeout(() => { setCopiedState(null); setOpenShareId(null); }, 1800);
    });
  };

  const handleCopyPageLink = (file: ScoreFile, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getPageLinkUrl(file)).then(() => {
      setCopiedState({ id: file.id, type: 'page' });
      setTimeout(() => { setCopiedState(null); setOpenShareId(null); }, 1800);
    });
  };

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
        offline: true,
        size: file.size
      };
      await storageService.cacheFileOffline(newFile, file);
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
    setConnecting(true);
    setErrorMsg(null);
    try {
      const token = await googleDriveService.getAccessToken();
      setDriveToken(token);
      const picked = await googleDriveService.openPicker(token);
      if (picked) {
        await handleDriveFileSelected(picked);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Google sign-in failed.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDriveFileSelected = async (metadata: GoogleDriveFileMetadata) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const token = driveToken || await googleDriveService.getAccessToken();
      const currentFiles = await storageService.getFiles();
      const existing = currentFiles.find(f => f.id === metadata.id);
      if (existing) {
        existing.lastOpened = Date.now();
        existing.name = metadata.name.replace(/\.pdf$/i, '');
        existing.size = metadata.size;
        existing.thumbnail = metadata.thumbnailLink;
        await storageService.saveFileMetadata(existing);
        await loadFiles();
        setLoading(false);
        if (existing.offline) {
          onOpenFile(existing);
        } else {
          const blob = await googleDriveService.downloadFile(existing.id, token);
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
      const blob = await googleDriveService.downloadFile(newFile.id, token);
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
        const token = driveToken || await googleDriveService.getAccessToken();
        const blob = await googleDriveService.downloadFile(file.id, token);
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

  // Intercept library list clicks for Drive files that aren't offline-cached.
  // We download the blob here (in a user-gesture context) rather than deferring
  // to ViewerPage's useEffect, where browser popup policy blocks the OAuth call.
  const handleFileClick = async (file: ScoreFile, page?: number) => {
    if (file.source === 'local' && !file.offline) {
      // Legacy local file without a cached blob — ask user to re-upload it
      setErrorMsg(`"${file.name}" needs to be re-uploaded. Drop the PDF again to reopen it.`);
      return;
    }
    if (file.source !== 'google-drive' || file.offline) {
      // Local files (offline) and offline-cached Drive files: open from IndexedDB
      onOpenFile(file, undefined, page);
      return;
    }
    if (!isOnline) {
      setErrorMsg('You must be online to open this score.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const token = driveToken || await googleDriveService.getAccessToken();
      if (!driveToken) setDriveToken(token);
      const blob = await googleDriveService.downloadFile(file.id, token);
      onOpenFile(file, blob, page);
    } catch (err: any) {
      setErrorMsg('Failed to open from Google Drive: ' + err.message);
    } finally {
      setLoading(false);
    }
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
          <div className="flex items-center gap-3">
            {/* Logo */}
            <svg viewBox="0 -960 960 960" className="w-10 h-10 flex-shrink-0">
              {/* Outer folder frames */}
              <path
                d="M320-240q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320Zm0-80h480v-480H320v480ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm160-720v480-480Z"
                fill="currentColor"
                style={{ color: 'var(--md-on-surface-variant)' }}
              />
              {/* The note (amber yellow tint) */}
              <path
                d="M500-360q42 0 71-29t29-71v-220h120v-80H560v220q-13-10-28-15t-32-5q-42 0-71 29t-29 71q0 42 29 71t71 29Z"
                fill="#FFB300"
              />
            </svg>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}>
                Score Tone
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--md-on-surface-variant)' }}>
                Your sheet music, in perfect light
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAboutModal(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
            style={{
              background: 'var(--md-surface-2)',
              color: 'var(--md-on-surface-variant)',
              border: '1px solid var(--md-outline-variant)'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--md-surface-2)')}
          >
            About
          </button>
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
              <>
                <button
                  onClick={handleGoogleDrivePick}
                  disabled={connecting || loading || !isOnline}
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
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                  </svg>
                  {connecting ? 'Connecting…' : 'Open from Google Drive'}
                </button>
              </>
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

              <div className="flex items-center gap-3">
                {/* Online/Offline status pill */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    background: isOnline ? 'rgba(55,120,60,0.2)' : 'rgba(200,120,0,0.15)',
                    color: isOnline ? '#81C784' : 'var(--md-primary)',
                  }}>
                  {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
                  {isOnline ? 'Online' : 'Offline'}
                </div>

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
                    onClick={() => handleFileClick(file)}
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
                          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
                          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
                          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
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
                      {file.bookmarks && file.bookmarks.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {[...file.bookmarks]
                            .sort((a, b) => a.page - b.page)
                            .map(bm => (
                              <button
                                key={bm.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFileClick(file, bm.page);
                                }}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors flex items-center gap-1"
                                style={{
                                  background: 'rgba(255, 183, 77, 0.12)',
                                  color: 'var(--md-primary)',
                                  border: '1px solid rgba(255, 183, 77, 0.2)'
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.background = 'rgba(255, 183, 77, 0.22)';
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.background = 'rgba(255, 183, 77, 0.12)';
                                }}
                              >
                                <span className="material-symbols-outlined text-[10px] leading-none">bookmark</span>
                                {bm.name} <span className="opacity-60 font-normal">(p.{bm.page})</span>
                              </button>
                            ))}
                        </div>
                      )}
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
                      {/* Share dropdown */}
                      <div
                        ref={el => { if (el) shareMenuRefs.current.set(file.id, el); else shareMenuRefs.current.delete(file.id); }}
                        style={{ position: 'relative' }}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); setOpenShareId(id => id === file.id ? null : file.id); }}
                          className={`md-icon-btn ${openShareId === file.id ? 'active' : ''}`}
                          title="Share"
                          style={{ width: 32, height: 32 }}
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                          </svg>
                        </button>

                        {openShareId === file.id && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 'calc(100% + 6px)',
                              right: 0,
                              minWidth: 200,
                              background: 'var(--md-surface-3)',
                              border: '1px solid var(--md-outline-variant)',
                              borderRadius: 12,
                              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                              overflow: 'hidden',
                              zIndex: 200,
                            }}
                          >
                            <button
                              onClick={e => handleCopyScoreLink(file, e)}
                              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left transition-colors hover:bg-white/5"
                              style={{ color: 'var(--md-on-surface)' }}
                            >
                              <span className="material-symbols-outlined text-[16px] leading-none" style={{ color: 'var(--md-on-surface-variant)' }}>
                                {copiedState?.id === file.id && copiedState.type === 'score' ? 'check' : 'menu_book'}
                              </span>
                              {copiedState?.id === file.id && copiedState.type === 'score' ? 'Copied!' : 'Copy link to score'}
                            </button>

                            <div style={{ height: 1, background: 'var(--md-outline-variant)', margin: '0 12px' }} />

                            <button
                              onClick={e => handleCopyPageLink(file, e)}
                              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-left transition-colors hover:bg-white/5"
                              style={{ color: 'var(--md-on-surface)' }}
                            >
                              <span className="material-symbols-outlined text-[16px] leading-none" style={{ color: 'var(--md-on-surface-variant)' }}>
                                {copiedState?.id === file.id && copiedState.type === 'page' ? 'check' : 'article'}
                              </span>
                              {copiedState?.id === file.id && copiedState.type === 'page'
                                ? 'Copied!'
                                : `Copy link to page ${file.lastPage}`}
                            </button>
                          </div>
                        )}
                      </div>

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

        {/* ── Footer ── */}
        <footer className="mt-16 border-t border-white/5 pt-8 pb-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>
          <p>&copy; {new Date().getFullYear()} Score Tone. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-white transition-colors">Terms of Service</a>
          </div>
        </footer>
      </div>

      {/* About Modal */}
      {showAboutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAboutModal(false); }}
        >
          <div
            className="flex flex-col rounded-2xl overflow-hidden max-w-md w-full max-h-[85vh]"
            style={{
              background: 'var(--md-surface-3)',
              border: '1px solid var(--md-outline-variant)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}>
                About Score Tone
              </h2>
              <button
                onClick={() => setShowAboutModal(false)}
                className="p-1 rounded-full hover:bg-black/10 transition-colors"
                style={{ color: 'var(--md-on-surface-variant)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex flex-col gap-4 text-xs leading-relaxed" style={{ color: 'var(--md-on-surface-variant)' }}>
              <p>
                Score Tone is a modern, privacy-focused sheet music viewer.
                It is a part of the <a href="https://practice-mate.app" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:underline font-semibold">Practice Mate</a> ecosystem, helping musicians practice and manage their repertoire.
              </p>
              <div className="flex flex-col gap-2.5">
                <div className="flex gap-2">
                  <span className="text-amber-500 font-bold">•</span>
                  <span><strong>Visual Comfort:</strong> Adjust Sepia, Paper Warmth, Ink Darkness, Contrast, and Background Colors (Ivory, Sepia Cream, Soft Black, Charcoal) for any performance lighting.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-amber-500 font-bold">•</span>
                  <span><strong>Offline Library:</strong> Save scores securely in your browser's IndexedDB for complete offline access.</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-amber-500 font-bold">•</span>
                  <span><strong>Page Sharing:</strong> Generate page-specific links to share your currently viewed score and page directly with others.</span>
                </div>
              </div>
              <div className="border-t pt-4" style={{ borderColor: 'var(--md-outline-variant)' }}>
                <h3 className="font-semibold mb-1" style={{ color: 'var(--md-on-surface)' }}>Google Drive Integration</h3>
                <p>
                  Connecting Google Drive allows you to search and select PDF scores using the secure, Google-hosted Picker interface.
                  We request narrow read-only access to selected files (<code className="px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--md-surface-1)', color: 'var(--md-on-surface)' }}>drive.file</code>) to retrieve and display your chosen PDF files.
                  Your files are processed entirely client-side, and your access token is stored temporarily in <code className="px-1 py-0.5 rounded text-[10px]" style={{ background: 'var(--md-surface-1)', color: 'var(--md-on-surface)' }}>sessionStorage</code> (which is discarded when you close the tab).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default LibraryPage;
