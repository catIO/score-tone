import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileUp, HardDrive, Trash2, FileText, CheckCircle2, Download, AlertCircle, CloudOff, X, Music, Repeat, Cloud, Info, BookOpen, Sliders, Play, Bookmark as BookmarkIcon } from 'lucide-react';
import { storageService, isMusicXmlFile, type ScoreFile, type Bookmark } from '../services/storageService';
import { googleDriveService, type GoogleDriveFileMetadata } from '../services/googleDriveService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface LibraryPageProps {
  onOpenFile: (file: ScoreFile, inMemoryBlob?: Blob, page?: number, queryParams?: Record<string, string>) => void;
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
  const [showGuideModal, setShowGuideModal] = useState(false);
  // Share dropdown state: tracks which card's menu is open and which item was just copied
  const [openShareId, setOpenShareId] = useState<string | null>(null);
  const [copiedState, setCopiedState] = useState<{ id: string; type: 'score' | 'page' } | null>(null);
  const shareMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOnline = useNetworkStatus();
  const isGoogleConfigured = googleDriveService.isConfigured();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  const handleContainerDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleContainerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleContainerDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    if (e.dataTransfer.files?.length > 0) {
      await processLocalFile(e.dataTransfer.files[0]);
    }
  };

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
    const nameLower = file.name.toLowerCase();
    let isPdf = file.type === 'application/pdf' || nameLower.endsWith('.pdf');
    let isXml = file.type.includes('xml') || nameLower.endsWith('.xml') || nameLower.endsWith('.musicxml') || nameLower.endsWith('.mxl');

    // On iOS/iPadOS, files from Files app might have generic MIME types; sniff initial content
    if (!isPdf && !isXml) {
      try {
        const slice = await file.slice(0, 200).text();
        if (slice.includes('<?xml') || slice.includes('<score-partwise') || slice.includes('<score-timewise')) {
          isXml = true;
        } else if (slice.startsWith('%PDF-')) {
          isPdf = true;
        }
      } catch {
        // ignore
      }
    }

    if (!isPdf && !isXml) {
      setErrorMsg('Only PDF and MusicXML files (.xml, .musicxml, .mxl) are supported.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const fileId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newFile: ScoreFile = {
        id: fileId,
        name: file.name.replace(/\.(pdf|xml|musicxml|mxl)$/i, ''),
        source: 'local',
        fileType: isXml ? 'musicxml' : 'pdf',
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
      setErrorMsg(isXml ? 'Failed to load MusicXML file.' : 'Failed to load PDF.');
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
      const token = driveToken || await googleDriveService.getAccessToken().catch(() => undefined);
      const currentFiles = await storageService.getFiles();
      const existing = currentFiles.find(f => f.id === metadata.id);

      const cachedBlob = await storageService.getFileData(metadata.id);
      if (cachedBlob) {
        const fileToOpen: ScoreFile = existing
          ? { ...existing, lastOpened: Date.now(), offline: true, size: metadata.size, thumbnail: metadata.thumbnailLink }
          : {
            id: metadata.id,
            name: metadata.name.replace(/\.pdf$/i, ''),
            source: 'google-drive',
            lastOpened: Date.now(),
            lastPage: 1,
            offline: true,
            size: metadata.size,
            thumbnail: metadata.thumbnailLink
          };
        await storageService.saveFileMetadata(fileToOpen);
        await loadFiles();
        setLoading(false);
        onOpenFile(fileToOpen, cachedBlob);
        return;
      }

      const blob = await googleDriveService.downloadFile(metadata.id, token);
      const newFile: ScoreFile = {
        ...(existing || {}),
        id: metadata.id,
        name: metadata.name.replace(/\.pdf$/i, ''),
        source: 'google-drive',
        lastOpened: Date.now(),
        lastPage: existing?.lastPage ?? 1,
        offline: true,
        size: blob.size || metadata.size,
        thumbnail: metadata.thumbnailLink
      };
      await storageService.cacheFileOffline(newFile, blob);
      await loadFiles();
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
          setErrorMsg('Open the file in the viewer and click "Save Offline" to cache local files.');
          setLoading(false);
          return;
        }
        if (!isOnline) {
          setErrorMsg('You must be online to cache Google Drive files.');
          setLoading(false);
          return;
        }
        let token = driveToken;
        if (!token) {
          try {
            token = await googleDriveService.getAccessToken({ allowInteractive: false });
            if (token) setDriveToken(token);
          } catch {
            // fall through to attempt download with cached/public strategies
          }
        }
        let blob: Blob;
        try {
          blob = await googleDriveService.downloadFile(file.id, token || undefined);
        } catch (downloadErr: any) {
          if (isGoogleConfigured && file.source === 'google-drive') {
            token = await googleDriveService.getAccessToken({ allowInteractive: true });
            setDriveToken(token);
            blob = await googleDriveService.downloadFile(file.id, token);
          } else {
            throw downloadErr;
          }
        }
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
  const handleFileClick = async (file: ScoreFile, page?: number, queryParams?: Record<string, string>) => {
    if (file.source === 'local' && !file.offline) {
      // Legacy local file without a cached blob — ask user to re-upload it
      setErrorMsg(`"${file.name}" needs to be re-uploaded. Drop the PDF again to reopen it.`);
      return;
    }

    // 1. First check if the PDF blob is already cached in IndexedDB
    try {
      const cachedBlob = await storageService.getFileData(file.id);
      if (cachedBlob) {
        if (!file.offline) {
          await storageService.saveFileMetadata({ ...file, offline: true });
          await loadFiles();
        }
        onOpenFile(file, cachedBlob, page, queryParams);
        return;
      }
    } catch {
      // Ignore cache check errors, fall through to download
    }

    if (!isOnline) {
      setErrorMsg('You must be online to open this score.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      let token = driveToken;
      if (!token) {
        try {
          token = await googleDriveService.getAccessToken({ allowInteractive: false });
          if (token) setDriveToken(token);
        } catch {
          // No cached token available; downloadFile will use cached/public download strategies
        }
      }

      let blob: Blob;
      try {
        blob = await googleDriveService.downloadFile(file.id, token || undefined);
      } catch (firstErr: any) {
        // If downloading failed (e.g. 403 on private file or expired token), retry with interactive auth
        // since handleFileClick is directly triggered in response to a user click.
        if (isGoogleConfigured && file.source === 'google-drive') {
          token = await googleDriveService.getAccessToken({ allowInteractive: true });
          setDriveToken(token);
          blob = await googleDriveService.downloadFile(file.id, token);
        } else {
          throw firstErr;
        }
      }

      await storageService.cacheFileOffline(file, blob);
      await loadFiles();
      onOpenFile(file, blob, page, queryParams);
    } catch (err: any) {
      setErrorMsg('Failed to open from Google Drive: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBookmarkClick = (file: ScoreFile, bm: Bookmark, e: React.MouseEvent) => {
    e.stopPropagation();
    if (bm.type === 'loop' && bm.loopRange) {
      const queryParams: Record<string, string> = {
        loopStartBeat: String(bm.loopRange.startBeat),
        loopEndBeat: String(bm.loopRange.endBeat),
        ...(bm.loopRange.startMeasure !== undefined ? { loopStartM: String(bm.loopRange.startMeasure) } : {}),
        ...(bm.loopRange.endMeasure !== undefined ? { loopEndM: String(bm.loopRange.endMeasure) } : {}),
        ...(bm.bpm ? { bpm: String(bm.bpm) } : {}),
      };
      handleFileClick(file, bm.page, queryParams);
    } else {
      handleFileClick(file, bm.page);
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
    <div
      className="page-container overflow-y-auto relative min-h-screen"
      style={{ background: 'var(--md-surface)' }}
      onDragEnter={handleContainerDragEnter}
      onDragLeave={handleContainerDragLeave}
      onDragOver={e => e.preventDefault()}
      onDrop={handleContainerDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".pdf,.xml,.musicxml,.mxl,application/pdf,text/xml,application/xml,text/plain,application/octet-stream,text/*"
        className="hidden"
      />
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuideModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all hover:bg-white/10 active:scale-95"
              style={{
                background: 'var(--md-surface-2)',
                color: 'var(--md-primary)',
                border: '1px solid var(--md-outline-variant)'
              }}
              title="App features & how to use"
            >
              <Info className="w-3.5 h-3.5" />
              <span>How to Use</span>
            </button>
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

        {/* ── Library Header Bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}>
              My Library
            </h2>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-semibold"
              style={{
                background: 'var(--md-surface-2)',
                color: 'var(--md-on-surface-variant)',
                border: '1px solid var(--md-outline-variant)',
              }}
            >
              {files.length} {files.length === 1 ? 'score' : 'scores'}
            </span>

            {/* Filter Tabs */}
            <div className="flex rounded-full overflow-hidden ml-1" style={{ border: '1px solid var(--md-outline-variant)', background: 'var(--md-surface-1)' }}>
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="px-3.5 py-1 text-xs font-semibold transition-colors"
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

          {/* Action cluster on right */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Offline status pill (only shown when disconnected) */}
            {!isOnline && (
              <div
                className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold flex-shrink-0"
                style={{
                  background: 'rgba(200, 120, 0, 0.15)',
                  color: 'var(--md-primary)',
                  border: '1px solid rgba(255, 183, 77, 0.25)',
                }}
                title="Offline mode — local scores are accessible"
              >
                <CloudOff className="w-3.5 h-3.5" />
                <span>Offline</span>
              </div>
            )}

            {/* Add Score button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold transition-all hover:brightness-110 active:scale-95 flex-shrink-0 shadow-sm"
              style={{
                background: 'var(--md-primary)',
                color: 'var(--md-on-primary)',
              }}
              title="Add PDF or MusicXML score"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>Add Score</span>
            </button>

            {/* Google Drive button */}
            {isGoogleConfigured && (
              <button
                onClick={handleGoogleDrivePick}
                disabled={connecting || loading || !isOnline}
                className="flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold transition-all hover:bg-white/10 active:scale-95 flex-shrink-0 disabled:opacity-40"
                style={{
                  background: 'var(--md-surface-2)',
                  color: 'var(--md-on-surface)',
                  border: '1px solid var(--md-outline-variant)',
                }}
                title="Browse Google Drive"
              >
                <svg width="15" height="15" viewBox="0 0 87.3 78" fill="none">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                  <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
                  <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
                  <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                  <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                  <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                </svg>
                <span>{connecting ? 'Connecting…' : 'Google Drive'}</span>
              </button>
            )}

            {(loading || connecting) && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>
                <div className="w-4 h-4 rounded-full border-2 border-transparent animate-spin"
                  style={{ borderTopColor: 'var(--md-primary)' }} />
              </div>
            )}
          </div>
        </div>

        {/* ── Library Content (Full-Width) ── */}
        {files.length === 0 ? (
          /* Empty Library Onboarding Hero */
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center p-12 md:p-16 rounded-3xl cursor-pointer transition-all hover:border-[var(--md-primary)] text-center my-6"
            style={{
              border: '2px dashed var(--md-outline-variant)',
              background: 'var(--md-surface-1)',
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-md"
              style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }}
            >
              <FileUp className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--md-on-surface)' }}>
              Add your first sheet music
            </h3>
            <p className="text-sm max-w-sm mb-6" style={{ color: 'var(--md-on-surface-variant)' }}>
              Drop a PDF or MusicXML file here, or click to browse files on your device.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="md-btn-filled text-xs py-2 px-5 rounded-full"
              >
                Browse Files
              </button>
              {isGoogleConfigured && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleGoogleDrivePick(); }}
                  disabled={connecting || loading || !isOnline}
                  className="md-btn-tonal text-xs py-2 px-5 rounded-full flex items-center gap-2"
                >
                  <svg width="16" height="16" viewBox="0 0 87.3 78" fill="none">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                  </svg>
                  <span>Google Drive</span>
                </button>
              )}
            </div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl gap-3"
            style={{ background: 'var(--md-surface-1)', color: 'var(--md-on-surface-variant)' }}>
            <FileText className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">No {activeTab === 'all' ? '' : activeTab} scores found</p>
            {activeTab === 'drive' && isGoogleConfigured && (
              <button
                onClick={handleGoogleDrivePick}
                className="md-btn-tonal text-xs py-1.5 px-4 rounded-full mt-2"
              >
                Open from Google Drive
              </button>
            )}
          </div>
        ) : (
              <div className="flex flex-col gap-2">
                {filteredFiles.map(file => (
                  <div
                    key={file.id}
                    onClick={() => handleFileClick(file)}
                    className="flex items-start gap-4 px-4 py-3.5 rounded-xl cursor-pointer transition-colors group"
                    style={{ background: 'var(--md-surface-1)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--md-surface-1)')}
                  >
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
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
                      ) : isMusicXmlFile(file) ? (
                        <Music className="w-5 h-5 text-orange-400" />
                      ) : (
                        <HardDrive className="w-5 h-5" style={{ color: 'var(--md-on-surface-variant)' }} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--md-on-surface)' }}>
                          {file.name}
                        </p>
                        {isMusicXmlFile(file) && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 flex-shrink-0">
                            MusicXML
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--md-on-surface-variant)' }}>
                        {[formatSize(file.size), !isMusicXmlFile(file) ? `p.${file.lastPage}` : undefined, formatDate(file.lastOpened)].filter(Boolean).join(' · ')}
                      </p>
                      {file.bookmarks && file.bookmarks.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {[...file.bookmarks]
                            .sort((a, b) => a.page - b.page)
                            .map(bm => {
                              const isLoop = bm.type === 'loop';
                              const loopMeasures = isLoop && bm.loopRange?.startMeasure && bm.loopRange?.endMeasure;
                              const alreadyHasMeasuresInName = loopMeasures && (bm.name.includes('m.') || bm.name.includes(`${bm.loopRange?.startMeasure}`));
                              return (
                                <button
                                  key={bm.id}
                                  onClick={(e) => handleBookmarkClick(file, bm, e)}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors flex items-center gap-1"
                                  style={{
                                    background: isLoop ? 'rgba(234, 88, 12, 0.16)' : 'rgba(255, 183, 77, 0.12)',
                                    color: isLoop ? '#fb923c' : 'var(--md-primary)',
                                    border: isLoop ? '1px solid rgba(234, 88, 12, 0.35)' : '1px solid rgba(255, 183, 77, 0.2)'
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.background = isLoop ? 'rgba(234, 88, 12, 0.26)' : 'rgba(255, 183, 77, 0.22)';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.background = isLoop ? 'rgba(234, 88, 12, 0.16)' : 'rgba(255, 183, 77, 0.12)';
                                  }}
                                  title={isLoop ? `Practice loop: ${bm.name}` : `Jump to page ${bm.page}`}
                                >
                                  {isLoop ? (
                                    <Repeat className="w-2.5 h-2.5" />
                                  ) : (
                                    <span className="material-symbols-outlined text-[10px] leading-none">bookmark</span>
                                  )}
                                  {bm.name}
                                  {loopMeasures && !alreadyHasMeasuresInName ? (
                                    <span className="opacity-70 font-normal">(m.{bm.loopRange?.startMeasure}–{bm.loopRange?.endMeasure})</span>
                                  ) : !isLoop ? (
                                    <span className="opacity-60 font-normal">(p.{bm.page})</span>
                                  ) : null}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* Right column: Offline / Cloud chip + Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                      {file.source === 'google-drive' && (
                        file.offline ? (
                          <span className="md-chip md-chip-success" title="Saved locally — available offline">
                            <CheckCircle2 className="w-3 h-3" /> Saved Offline
                          </span>
                        ) : (
                          <span className="md-chip md-chip-warning" title="Stored on Google Drive — requires internet to open">
                            <Cloud className="w-3 h-3" /> Cloud Only
                          </span>
                        )
                      )}

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

                        {file.source === 'google-drive' && (
                          <button
                            onClick={e => toggleOfflineCache(file, e)}
                            className="md-icon-btn"
                            title={file.offline ? 'Remove offline copy (keep in cloud)' : 'Download for offline access'}
                            style={{ width: 32, height: 32 }}
                          >
                            {file.offline ? <CloudOff className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                          </button>
                        )}
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
                  </div>
                ))}
              </div>
            )}

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

              <div className="border-t pt-4 flex gap-4 text-xs font-semibold" style={{ borderColor: 'var(--md-outline-variant)' }}>
                <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--md-primary)' }} className="hover:underline">
                  Privacy Policy
                </a>
                <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--md-primary)' }} className="hover:underline">
                  Terms of Service
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Features & How to Use Guide Modal */}
      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowGuideModal(false); }}
        >
          <div
            className="flex flex-col rounded-2xl overflow-hidden max-w-lg w-full max-h-[88vh]"
            style={{
              background: 'var(--md-surface-3)',
              border: '1px solid var(--md-outline-variant)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--md-outline-variant)' }}
            >
              <div className="flex items-center gap-2.5">
                <Info className="w-5 h-5 text-[var(--md-primary)]" />
                <h2 className="text-base font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}>
                  Features & How to Use
                </h2>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="p-1 rounded-full hover:bg-white/10 transition-colors"
                style={{ color: 'var(--md-on-surface-variant)' }}
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex flex-col gap-4 text-xs leading-relaxed" style={{ color: 'var(--md-on-surface-variant)' }}>
              {/* Feature 1: Page Navigation */}
              <div className="p-3.5 rounded-xl flex gap-3.5" style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="p-2 rounded-lg h-fit flex-shrink-0" style={{ background: 'rgba(255, 183, 77, 0.12)', color: 'var(--md-primary)' }}>
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--md-on-surface)' }}>Reading & Page Navigation</h3>
                  <p className="mb-1.5">Turn pages seamlessly during practice and live performances:</p>
                  <ul className="list-disc pl-4 flex flex-col gap-1">
                    <li><strong>Keys & Pedals:</strong> Arrow keys, mouse wheel, or Bluetooth foot pedals (Page Up / Page Down).</li>
                    <li><strong>Touch & Click:</strong> Tap the left side to go back, right side to turn forward.</li>
                    <li><strong>Distraction-Free:</strong> Auto-hide controls keep sheet music full screen. Move your cursor to the top bar or right edge (or tap) to reveal menus.</li>
                  </ul>
                </div>
              </div>

              {/* Feature 2: 1-Click Bookmarking */}
              <div className="p-3.5 rounded-xl flex gap-3.5" style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="p-2 rounded-lg h-fit flex-shrink-0" style={{ background: 'rgba(255, 183, 77, 0.12)', color: 'var(--md-primary)' }}>
                  <BookmarkIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--md-on-surface)' }}>Quick Bookmarking</h3>
                  <p className="mb-1.5">Organize movements and practice passages with ease:</p>
                  <ul className="list-disc pl-4 flex flex-col gap-1">
                    <li><strong>1-Click Bookmark:</strong> Click the bookmark icon in the top toolbar to instantly bookmark the active page.</li>
                    <li><strong>Visual Indicator:</strong> Bookmarked pages display an amber corner ribbon on the score canvas.</li>
                    <li><strong>Side Panel:</strong> Open the Bookmarks tab on the right rail to jump to sections, give bookmarks custom names, or copy shareable permalinks.</li>
                  </ul>
                </div>
              </div>

              {/* Feature 3: Visual Tone & Lighting */}
              <div className="p-3.5 rounded-xl flex gap-3.5" style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="p-2 rounded-lg h-fit flex-shrink-0" style={{ background: 'rgba(255, 183, 77, 0.12)', color: 'var(--md-primary)' }}>
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--md-on-surface)' }}>Page Tone & Display Controls</h3>
                  <p className="mb-1.5">Customize score appearance for any lighting conditions:</p>
                  <ul className="list-disc pl-4 flex flex-col gap-1">
                    <li><strong>Comfort Sliders:</strong> Tune Sepia, Warmth, Contrast, and Ink Darkness to reduce eye strain under harsh stage lights or dark pits.</li>
                    <li><strong>Background Presets:</strong> Switch between Ivory, Sepia Cream, Soft Black, and Pure Dark styles.</li>
                    <li><strong>Two-Page Mode:</strong> View two pages side-by-side on wide desktop or landscape tablet screens.</li>
                  </ul>
                </div>
              </div>

              {/* Feature 4: Audio Playback (MusicXML) */}
              <div className="p-3.5 rounded-xl flex gap-3.5" style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="p-2 rounded-lg h-fit flex-shrink-0" style={{ background: 'rgba(255, 183, 77, 0.12)', color: 'var(--md-primary)' }}>
                  <Play className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--md-on-surface)' }}>MusicXML Play-Along & Loops</h3>
                  <p className="mb-1.5">Load interactive scores in <code>.xml</code>, <code>.musicxml</code>, or <code>.mxl</code> format:</p>
                  <ul className="list-disc pl-4 flex flex-col gap-1">
                    <li><strong>Synthesized Audio:</strong> Play scores with built-in metronome count-in and variable BPM tempo control.</li>
                    <li><strong>Loop Practice:</strong> Select A-B loops to practice difficult measures repetitively.</li>
                  </ul>
                </div>
              </div>

              {/* Feature 5: Storage & Cloud Drive */}
              <div className="p-3.5 rounded-xl flex gap-3.5" style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="p-2 rounded-lg h-fit flex-shrink-0" style={{ background: 'rgba(255, 183, 77, 0.12)', color: 'var(--md-primary)' }}>
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--md-on-surface)' }}>Offline Storage & Google Drive</h3>
                  <ul className="list-disc pl-4 flex flex-col gap-1">
                    <li><strong>Offline Access:</strong> Save scores locally in browser storage (IndexedDB) so you can perform without Wi-Fi.</li>
                    <li><strong>Google Drive:</strong> Connect Google Drive to browse and open scores securely with narrow read permissions.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className="flex justify-end px-6 py-3"
              style={{ borderTop: '1px solid var(--md-outline-variant)' }}
            >
              <button
                onClick={() => setShowGuideModal(false)}
                className="md-btn-filled text-xs py-1.5 px-4 rounded-full"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Full-Window Drag & Drop Overlay */}
      {isDraggingOver && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none select-none animate-fade-in"
          style={{
            background: 'rgba(20, 18, 16, 0.88)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="flex flex-col items-center gap-4 p-12 rounded-3xl text-center"
            style={{
              border: '3px dashed var(--md-primary)',
              background: 'var(--md-surface-2)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center animate-bounce shadow-lg"
              style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}
            >
              <FileUp className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-1" style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}>
                Drop score to add to Library
              </h3>
              <p className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>
                Supports PDF (.pdf) and MusicXML (.xml, .musicxml, .mxl)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default LibraryPage;
