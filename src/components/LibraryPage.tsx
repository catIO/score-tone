import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileUp, HardDrive, Trash2, FileText, CheckCircle2, Download, AlertCircle,
  CloudOff, X, Music, Repeat, BookOpen, Sliders, Play,
  Bookmark as BookmarkIcon, LayoutGrid, List, Search, ArrowUpDown, Clock
} from 'lucide-react';
import { storageService, isMusicXmlFile, type ScoreFile, type Bookmark } from '../services/storageService';
import { googleDriveService, type GoogleDriveFileMetadata } from '../services/googleDriveService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import HeaderBar from './HeaderBar';

interface LibraryPageProps {
  onOpenFile: (file: ScoreFile, inMemoryBlob?: Blob, page?: number, queryParams?: Record<string, string>) => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({ onOpenFile, theme = 'dark', onToggleTheme }) => {
  const [files, setFiles] = useState<ScoreFile[]>([]);
  const [subFilter, setSubFilter] = useState<'all' | 'offline' | 'recent'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('scoretone_view_mode') as 'grid' | 'list') || 'grid';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'size'>('recent');
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem('scoretone_view_mode', mode);
    } catch {
      // ignore
    }
  };

  // Keyboard shortcut: '/' or 'Cmd+K' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showAboutModal || showGuideModal) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAboutModal, showGuideModal]);

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

  const stats = {
    totalScores: files.length,
    pdfCount: files.filter(f => !isMusicXmlFile(f)).length,
    xmlCount: files.filter(f => isMusicXmlFile(f)).length,
    driveCount: files.filter(f => f.source === 'google-drive').length,
    offlineCount: files.filter(f => f.offline).length,
  };

  const getSectionTitle = () => {
    switch (subFilter) {
      case 'offline': return 'Offline Available';
      case 'recent': return 'Recently Practiced';
      default: return 'All Scores';
    }
  };

  const filteredFiles = files
    .filter(f => {
      if (subFilter === 'offline') return f.offline;
      if (subFilter === 'recent') {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return f.lastOpened >= sevenDaysAgo;
      }
      return true;
    })
    .filter(f => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      if (f.name.toLowerCase().includes(q)) return true;
      if (f.bookmarks && f.bookmarks.some(b => b.name.toLowerCase().includes(q))) return true;
      return false;
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      if (sortBy === 'size') {
        return (b.size || 0) - (a.size || 0);
      }
      // Default: 'recent'
      return b.lastOpened - a.lastOpened;
    });

  const renderShareDropdown = (file: ScoreFile, placement: 'top' | 'bottom' = 'bottom') => (
    <div
      ref={el => { if (el) shareMenuRefs.current.set(file.id, el); else shareMenuRefs.current.delete(file.id); }}
      className="relative"
      style={{ zIndex: openShareId === file.id ? 50 : undefined }}
    >
      <button
        onClick={e => { e.stopPropagation(); setOpenShareId(id => id === file.id ? null : file.id); }}
        className={`md-icon-btn ${openShareId === file.id ? 'active' : ''}`}
        title="Share"
        style={{ width: 30, height: 30 }}
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      </button>

      {openShareId === file.id && (
        <div
          style={{
            position: 'absolute',
            ...(placement === 'top'
              ? { bottom: 'calc(100% + 6px)', left: 0 }
              : { top: 'calc(100% + 6px)', right: 0 }),
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
            className="flex items-center gap-3 w-full px-4 py-2.5 text-xs text-left transition-colors hover:bg-white/5"
            style={{ color: 'var(--md-on-surface)' }}
          >
            <span className="material-symbols-outlined text-[15px] leading-none" style={{ color: 'var(--md-on-surface-variant)' }}>
              {copiedState?.id === file.id && copiedState.type === 'score' ? 'check' : 'menu_book'}
            </span>
            {copiedState?.id === file.id && copiedState.type === 'score' ? 'Copied!' : 'Copy link to score'}
          </button>

          <div style={{ height: 1, background: 'var(--md-outline-variant)', margin: '0 12px' }} />

          <button
            onClick={e => handleCopyPageLink(file, e)}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-xs text-left transition-colors hover:bg-white/5"
            style={{ color: 'var(--md-on-surface)' }}
          >
            <span className="material-symbols-outlined text-[15px] leading-none" style={{ color: 'var(--md-on-surface-variant)' }}>
              {copiedState?.id === file.id && copiedState.type === 'page' ? 'check' : 'article'}
            </span>
            {copiedState?.id === file.id && copiedState.type === 'page'
              ? 'Copied!'
              : `Copy link to page ${file.lastPage}`}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="page-container overflow-y-auto relative min-h-screen ambient-hero-glow"
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

      {/* ── Modern Top App Bar (Bright Sight inspired) ── */}
      <HeaderBar
        theme={theme}
        onToggleTheme={onToggleTheme || (() => {})}
        onAddScore={() => fileInputRef.current?.click()}
        onOpenDrive={isGoogleConfigured ? handleGoogleDrivePick : undefined}
        onOpenGuide={() => setShowGuideModal(true)}
        onOpenAbout={() => setShowAboutModal(true)}
        isGoogleConfigured={isGoogleConfigured}
        isOnline={isOnline}
        driveToken={driveToken}
        onDriveLogout={() => {
          googleDriveService.logout();
          setDriveToken(null);
        }}
        stats={stats}
      />

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* ── Error banner ── */}
        {errorMsg && (
          <div
            className="flex items-start gap-3 mb-6 p-4 rounded-2xl shadow-sm animate-fade"
            style={{ background: 'var(--md-error-container)', color: 'var(--md-error)' }}
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="text-sm flex-1 font-medium">{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs opacity-70 hover:opacity-100 font-semibold p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Sub-header: Title, Subtitle, Sort & View Toggles (Bright Sight pattern) ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h1
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}
            >
              {getSectionTitle()}
            </h1>
            <p className="text-xs sm:text-sm mt-0.5 font-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
              {files.length === 0
                ? '0 scores'
                : `${filteredFiles.length} of ${files.length} ${files.length === 1 ? 'score' : 'scores'}`}
            </p>
          </div>

          {/* Sub-header actions (Right) */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Offline indicator */}
            {!isOnline && (
              <div
                className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold flex-shrink-0 border"
                style={{
                  background: 'var(--md-warning-bg)',
                  borderColor: 'var(--md-warning-border)',
                  color: 'var(--md-warning-text)',
                }}
                title="Offline mode — local scores are accessible"
              >
                <CloudOff className="w-3.5 h-3.5" />
                <span>Offline</span>
              </div>
            )}

            {/* Sort Pill Dropdown (Bright Sight style) */}
            <div
              className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold cursor-pointer border transition-colors"
              style={{
                background: 'var(--md-surface-2)',
                borderColor: 'var(--md-outline-variant)',
                color: 'var(--md-on-surface)',
              }}
            >
              <ArrowUpDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--md-on-surface-variant)' }} />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer pr-1"
                style={{ color: 'var(--md-on-surface)' }}
                aria-label="Sort scores by"
              >
                <option value="recent" style={{ background: 'var(--md-surface-1)', color: 'var(--md-on-surface)' }}>
                  Recent
                </option>
                <option value="name" style={{ background: 'var(--md-surface-1)', color: 'var(--md-on-surface)' }}>
                  Title (A–Z)
                </option>
                <option value="size" style={{ background: 'var(--md-surface-1)', color: 'var(--md-on-surface)' }}>
                  Size
                </option>
              </select>
            </div>

            {/* View Mode Toggle Pill */}
            <div
              className="flex items-center h-8 rounded-full p-0.5 border"
              style={{
                borderColor: 'var(--md-outline-variant)',
                background: 'var(--md-surface-2)',
              }}
            >
              <button
                onClick={() => handleViewModeChange('grid')}
                className={`h-7 px-2.5 rounded-full transition-all flex items-center justify-center ${
                  viewMode === 'grid'
                    ? 'shadow-sm font-bold'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{
                  background: viewMode === 'grid' ? 'var(--md-surface-1)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--md-primary)' : 'var(--md-on-surface-variant)',
                }}
                title="Grid view"
                aria-label="Grid view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleViewModeChange('list')}
                className={`h-7 px-2.5 rounded-full transition-all flex items-center justify-center ${
                  viewMode === 'list'
                    ? 'shadow-sm font-bold'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{
                  background: viewMode === 'list' ? 'var(--md-surface-1)' : 'transparent',
                  color: viewMode === 'list' ? 'var(--md-primary)' : 'var(--md-on-surface-variant)',
                }}
                title="List view"
                aria-label="List view"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Filter Chips Row & Search Bar (Bright Sight pattern) ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          {/* Secondary Material Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => setSubFilter('all')}
              className={`md-filter-chip ${subFilter === 'all' ? 'active' : ''}`}
            >
              <span>All</span>
            </button>
            <button
              onClick={() => setSubFilter('offline')}
              className={`md-filter-chip ${subFilter === 'offline' ? 'active' : ''}`}
            >
              <HardDrive className="w-3 h-3" />
              <span>Offline Available</span>
            </button>
            <button
              onClick={() => setSubFilter('recent')}
              className={`md-filter-chip ${subFilter === 'recent' ? 'active' : ''}`}
            >
              <Clock className="w-3 h-3" />
              <span>Recently Practiced</span>
            </button>
          </div>

          {/* Search Input Pill */}
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--md-on-surface-variant)' }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setSearchQuery('');
                  searchInputRef.current?.blur();
                }
              }}
              placeholder="Search scores..."
              className="w-full pl-9 pr-8 py-1.5 rounded-full text-xs transition-all focus:outline-none focus:ring-2"
              style={{
                background: 'var(--md-surface-2)',
                color: 'var(--md-on-surface)',
                border: '1px solid var(--md-outline-variant)',
              }}
            />
            {searchQuery ? (
              <button
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:opacity-100 opacity-70 transition-opacity"
                style={{ color: 'var(--md-on-surface-variant)' }}
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <kbd
                  className="px-1.5 py-0.5 text-[10px] font-medium rounded border"
                  style={{
                    background: 'var(--md-surface-3)',
                    borderColor: 'var(--md-outline-variant)',
                    color: 'var(--md-on-surface-variant)',
                  }}
                >
                  /
                </kbd>
              </div>
            )}
          </div>
        </div>

        {/* ── Library Content ── */}
        {files.length === 0 ? (
          /* Empty Library Onboarding Hero */
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center p-6 sm:p-12 md:p-16 rounded-3xl cursor-pointer transition-all hover:border-[var(--md-primary)] text-center my-4 sm:my-6 relative overflow-hidden group"
            style={{
              border: '2px dashed var(--md-outline-variant)',
              background: 'var(--md-surface-1)',
            }}
          >
            <div className="absolute inset-0 score-cover-staves opacity-30 pointer-events-none" />
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-105 transition-transform"
              style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }}
            >
              <FileUp className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-1" style={{ color: 'var(--md-on-surface)' }}>
              Add your first sheet music
            </h3>
            <p className="text-sm max-w-sm mb-4" style={{ color: 'var(--md-on-surface-variant)' }}>
              Drop a PDF or MusicXML file here, or click to browse files on your device.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full border"
                style={{
                  background: 'var(--md-pdf-bg)',
                  borderColor: 'var(--md-pdf-border)',
                  color: 'var(--md-pdf-text)',
                }}
              >
                PDF (.pdf)
              </span>
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full border"
                style={{
                  background: 'var(--md-xml-bg)',
                  borderColor: 'var(--md-xml-border)',
                  color: 'var(--md-xml-text)',
                }}
              >
                MusicXML (.xml, .musicxml, .mxl)
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
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
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl gap-3 text-center"
            style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center border"
              style={{ background: 'var(--md-surface-2)', borderColor: 'var(--md-outline-variant)', color: 'var(--md-on-surface-variant)' }}>
              <Search className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--md-on-surface)' }}>
                {searchQuery ? `No scores matching "${searchQuery}"` : 'No scores found'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--md-on-surface-variant)' }}>
                {searchQuery ? 'Check your spelling or try clearing the search filter' : 'Try uploading a new score or checking other filters'}
              </p>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="md-btn-tonal text-xs py-1.5 px-4 rounded-full mt-2"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* ── Modern Card Grid View (Bright Sight Pattern) ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
            {filteredFiles.map(file => (
              <div
                key={file.id}
                onClick={() => handleFileClick(file)}
                className={`group relative flex flex-col md-card-m3 cursor-pointer select-none ${
                  openShareId === file.id ? 'z-30' : ''
                }`}
                style={{ zIndex: openShareId === file.id ? 35 : undefined }}
              >
                {/* Score Cover */}
                <div
                  className="relative aspect-[16/10] w-full overflow-hidden flex flex-col justify-between p-3.5 border-b transition-colors"
                  style={{
                    background: 'var(--md-cover-bg)',
                    borderColor: 'var(--md-card-border)',
                  }}
                >
                  {/* Stave lines overlay */}
                  <div className="absolute inset-0 score-cover-staves opacity-60 pointer-events-none" />

                  {/* Faint musical note watermark */}
                  <div className="absolute right-2 bottom-0 opacity-10 pointer-events-none select-none" style={{ color: 'var(--md-on-surface)' }}>
                    <Music className="w-24 h-24 transform rotate-12" />
                  </div>

                  {/* Top Badges Row */}
                  <div className="relative z-10 flex items-center justify-between gap-1.5 w-full">
                    {/* Format chip */}
                    {isMusicXmlFile(file) ? (
                      <span
                        className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-sm"
                        style={{
                          background: 'var(--md-xml-bg)',
                          borderColor: 'var(--md-xml-border)',
                          color: 'var(--md-xml-text)',
                        }}
                      >
                        <Music className="w-2.5 h-2.5" />
                        MusicXML
                      </span>
                    ) : (
                      <span
                        className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-sm"
                        style={{
                          background: 'var(--md-pdf-bg)',
                          borderColor: 'var(--md-pdf-border)',
                          color: 'var(--md-pdf-text)',
                        }}
                      >
                        <FileText className="w-2.5 h-2.5" />
                        PDF
                      </span>
                    )}

                    {/* Source chip */}
                    {file.source === 'google-drive' ? (
                      <span
                        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur-sm select-none"
                        style={{
                          background: 'var(--md-badge-glass)',
                          borderColor: 'var(--md-badge-glass-border)',
                          color: 'var(--md-on-surface-variant)',
                        }}
                        title="Source: Google Drive"
                      >
                        <svg width="11" height="10" viewBox="0 0 87.3 78" fill="none" className="shrink-0">
                          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
                          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
                          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                        </svg>
                        Drive
                      </span>
                    ) : (
                      <span
                        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur-sm"
                        style={{
                          background: 'var(--md-badge-glass)',
                          borderColor: 'var(--md-badge-glass-border)',
                          color: 'var(--md-on-surface-variant)',
                        }}
                        title="Local storage"
                      >
                        <HardDrive className="w-2.5 h-2.5" />
                        Local
                      </span>
                    )}
                  </div>

                  {/* Center Hover Action */}
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center z-20 pointer-events-none">
                    <span className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-400 text-amber-950 font-bold text-xs shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Open Score
                    </span>
                  </div>

                  {/* Bottom Cover Row: Date & Last Page */}
                  <div className="relative z-10 flex items-end justify-between w-full">
                    <span className="text-[10px] font-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
                      {formatDate(file.lastOpened)}
                    </span>
                    {!isMusicXmlFile(file) && file.lastPage && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded border backdrop-blur-sm"
                        style={{
                          background: 'var(--md-badge-glass)',
                          borderColor: 'var(--md-badge-glass-border)',
                          color: 'var(--md-on-surface)',
                        }}
                      >
                        p. {file.lastPage}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-3.5 flex flex-col flex-1 justify-between gap-3">
                  <div>
                    <h3
                      className="text-sm font-bold leading-snug line-clamp-2 transition-colors group-hover:text-amber-500 dark:group-hover:text-amber-300"
                      style={{ color: 'var(--md-on-surface)' }}
                      title={file.name}
                    >
                      {file.name}
                    </h3>
                    <p className="text-[11px] mt-1 flex items-center gap-1.5" style={{ color: 'var(--md-on-surface-variant)' }}>
                      <span>{formatSize(file.size)}</span>
                      <span>•</span>
                      <span>{formatDate(file.lastOpened)}</span>
                    </p>
                  </div>

                  {/* Bookmarks / practice loops */}
                  {file.bookmarks && file.bookmarks.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {[...file.bookmarks]
                        .sort((a, b) => a.page - b.page)
                        .slice(0, 2)
                        .map(bm => {
                          const isLoop = bm.type === 'loop';
                          const loopMeasures = isLoop && bm.loopRange?.startMeasure && bm.loopRange?.endMeasure;
                          const alreadyHasMeasuresInName = loopMeasures && (bm.name.includes('m.') || bm.name.includes(`${bm.loopRange?.startMeasure}`));
                          return (
                            <button
                              key={bm.id}
                              onClick={(e) => handleBookmarkClick(file, bm, e)}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 max-w-full truncate"
                              style={{
                                background: isLoop ? 'var(--md-loop-bg)' : 'var(--md-bookmark-bg)',
                                color: isLoop ? 'var(--md-loop-text)' : 'var(--md-bookmark-text)',
                                border: `1px solid ${isLoop ? 'var(--md-loop-border)' : 'var(--md-bookmark-border)'}`
                              }}
                              title={isLoop ? `Practice loop: ${bm.name}` : `Jump to page ${bm.page}`}
                            >
                              {isLoop ? <Repeat className="w-2.5 h-2.5 shrink-0" /> : <BookmarkIcon className="w-2.5 h-2.5 shrink-0 fill-current" />}
                              <span className="truncate">{bm.name}</span>
                              {loopMeasures && !alreadyHasMeasuresInName ? (
                                <span className="opacity-90 font-medium shrink-0">(m.{bm.loopRange?.startMeasure}–{bm.loopRange?.endMeasure})</span>
                              ) : !isLoop ? (
                                <span className="opacity-85 font-medium shrink-0">(p.{bm.page})</span>
                              ) : null}
                            </button>
                          );
                        })}
                      {file.bookmarks.length > 2 && (
                        <span className="text-[10px] self-center px-1" style={{ color: 'var(--md-on-surface-variant)' }}>
                          +{file.bookmarks.length - 2} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Card Actions Footer */}
                  <div
                    className="flex items-center justify-between pt-2 mt-auto border-t"
                    style={{ borderColor: 'var(--md-outline-variant)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      {renderShareDropdown(file, 'top')}
                      {file.source === 'google-drive' && (
                        <button
                          onClick={e => toggleOfflineCache(file, e)}
                          className="md-icon-btn transition-colors"
                          title={file.offline ? 'Saved on device • Click to remove offline copy (keeps in Drive)' : 'Download to device for offline access'}
                          style={{ width: 32, height: 32 }}
                        >
                          {file.offline ? (
                            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--md-success-text)' }} />
                          ) : (
                            <Download className="w-3.5 h-3.5 opacity-75 hover:opacity-100" />
                          )}
                        </button>
                      )}
                    </div>

                    <button
                      onClick={e => deleteFileRecord(file.id, e)}
                      className="md-icon-btn hover:text-rose-500 transition-colors"
                      title="Remove from library"
                      style={{ width: 32, height: 32 }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── Modern Refined List View ── */
          <div className="flex flex-col gap-2">
            {filteredFiles.map(file => (
              <div
                key={file.id}
                onClick={() => handleFileClick(file)}
                className={`relative flex items-center gap-4 px-4 py-3.5 rounded-2xl cursor-pointer transition-all md-card-m3 group select-none ${
                  openShareId === file.id ? 'z-30' : ''
                }`}
                style={{ zIndex: openShareId === file.id ? 35 : undefined }}
              >
                {/* Format Icon: Document (PDF/images) vs Playable (MusicXML) */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden border"
                  style={{
                    background: isMusicXmlFile(file) ? 'rgba(234, 88, 12, 0.14)' : 'var(--md-surface-2)',
                    borderColor: isMusicXmlFile(file) ? 'rgba(234, 88, 12, 0.35)' : 'var(--md-card-border)',
                  }}
                  title={isMusicXmlFile(file) ? 'Playable interactive score (MusicXML)' : 'Sheet music document (PDF)'}
                >
                  <div className="absolute inset-0 score-cover-staves opacity-50 pointer-events-none" />
                  {isMusicXmlFile(file) ? (
                    <Music className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  ) : (
                    <FileText className="w-5 h-5" style={{ color: 'var(--md-primary)' }} />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors" style={{ color: 'var(--md-on-surface)' }}>
                      {file.name}
                    </p>
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
                                background: isLoop ? 'var(--md-loop-bg)' : 'var(--md-bookmark-bg)',
                                color: isLoop ? 'var(--md-loop-text)' : 'var(--md-bookmark-text)',
                                border: `1px solid ${isLoop ? 'var(--md-loop-border)' : 'var(--md-bookmark-border)'}`
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
                                <span className="opacity-90 font-medium">(m.{bm.loopRange?.startMeasure}–{bm.loopRange?.endMeasure})</span>
                              ) : !isLoop ? (
                                <span className="opacity-85 font-medium">(p.{bm.page})</span>
                              ) : null}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Right column: Source & Offline status + Actions */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* Source Column (Aligned right in fixed-width column for straight vertical alignment) */}
                  <div className="w-24 sm:w-28 flex justify-end items-center shrink-0">
                    {file.source === 'google-drive' ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border select-none"
                        style={{
                          background: 'var(--md-surface-2)',
                          borderColor: 'var(--md-outline-variant)',
                          color: 'var(--md-on-surface-variant)',
                        }}
                        title="Source: Google Drive"
                      >
                        <svg width="12" height="11" viewBox="0 0 87.3 78" fill="none" className="shrink-0">
                          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
                          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
                          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
                          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
                          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
                        </svg>
                        <span>Drive</span>
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border opacity-75 select-none"
                        style={{
                          background: 'var(--md-surface-2)',
                          borderColor: 'var(--md-outline-variant)',
                          color: 'var(--md-on-surface-variant)',
                        }}
                        title="Stored locally on this device"
                      >
                        <HardDrive className="w-3 h-3" />
                        <span>Device</span>
                      </span>
                    )}
                  </div>

                  {/* Actions Column (Always visible, cloud button on the left next to Drive badge) */}
                  <div className="w-24 sm:w-28 flex items-center justify-end gap-1 opacity-85 hover:opacity-100 transition-opacity shrink-0">
                    {file.source === 'google-drive' ? (
                      <button
                        onClick={e => toggleOfflineCache(file, e)}
                        className="md-icon-btn transition-colors"
                        title={file.offline ? 'Saved on device • Click to remove offline copy (keeps in Drive)' : 'Download to device for offline access'}
                        style={{ width: 32, height: 32 }}
                      >
                        {file.offline ? (
                          <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--md-success-text)' }} />
                        ) : (
                          <Download className="w-4 h-4 opacity-75 hover:opacity-100" />
                        )}
                      </button>
                    ) : (
                      <div className="w-8 h-8 pointer-events-none" />
                    )}

                    {renderShareDropdown(file, 'bottom')}

                    <button
                      onClick={e => deleteFileRecord(file.id, e)}
                      className="md-icon-btn hover:text-rose-400 transition-colors"
                      style={{ width: 32, height: 32 }}
                      title="Remove from library"
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
        <footer className="mt-16 border-t pt-8 pb-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs" style={{ borderColor: 'var(--md-outline-variant)', color: 'var(--md-on-surface-variant)' }}>
          <p>&copy; {new Date().getFullYear()} Score Tone. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="hover:underline transition-colors" style={{ color: 'var(--md-on-surface-variant)' }}>Privacy Policy</a>
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="hover:underline transition-colors" style={{ color: 'var(--md-on-surface-variant)' }}>Terms of Service</a>
          </div>
        </footer>
      </main>

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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowGuideModal(false); }}
        >
          <div
            className="flex flex-col rounded-3xl overflow-hidden max-w-2xl w-full max-h-[88vh] shadow-2xl"
            style={{
              background: 'var(--md-surface-3)',
              border: '1px solid var(--md-outline-variant)',
            }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between px-6 sm:px-8 py-5"
              style={{ borderBottom: '1px solid var(--md-outline-variant)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255, 183, 77, 0.16)', color: 'var(--md-primary)' }}
                >
                  <Music className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'Outfit, sans-serif' }}>
                    Musician&apos;s Guide to ScoreTone
                  </h2>
                  <p className="text-xs sm:text-[13px] mt-0.5" style={{ color: 'var(--md-on-surface-variant)' }}>
                    Rehearse, read, and perform from your music stand with confidence
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                style={{ color: 'var(--md-on-surface-variant)' }}
                title="Close guide"
                aria-label="Close guide"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-8 overflow-y-auto flex flex-col gap-4 text-sm leading-relaxed" style={{ color: 'var(--md-on-surface-variant)' }}>
              {/* Feature 1: Page Navigation & Performance */}
              <div className="p-4 sm:p-5 rounded-2xl flex gap-4" style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255, 183, 77, 0.14)', color: 'var(--md-primary)' }}>
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-base mb-1" style={{ color: 'var(--md-on-surface)' }}>Reading & Hands-Free Page Turns</h3>
                  <p className="mb-2 text-[13px]">Turn pages without taking your hands off your instrument:</p>
                  <ul className="list-disc pl-4 flex flex-col gap-1.5 text-[13px]">
                    <li><strong>Foot Pedals & Keys:</strong> Supports Bluetooth page turner pedals (Page Up / Page Down), keyboard arrows (← / →), and Spacebar to advance.</li>
                    <li><strong>Tap Zones:</strong> Tap the left side of your screen to turn back; tap anywhere on the right side to turn forward.</li>
                    <li><strong>Distraction-Free:</strong> Toolbars fade away while playing so you see only sheet music. Tap anywhere or move your mouse to bring menus back.</li>
                    <li><strong>Two-Page Spread:</strong> Automatically shows two pages side-by-side on wide tablet screens in landscape or desktop monitors.</li>
                  </ul>
                </div>
              </div>

              {/* Feature 2: Bookmarks */}
              <div className="p-4 sm:p-5 rounded-2xl flex gap-4" style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255, 183, 77, 0.14)', color: 'var(--md-primary)' }}>
                  <BookmarkIcon className="w-5 h-5 fill-current" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-base mb-1" style={{ color: 'var(--md-on-surface)' }}>Rehearsal Bookmarks</h3>
                  <p className="mb-2 text-[13px]">Jump instantly to movements, cadenzas, and rehearsal letters within any piece:</p>
                  <ul className="list-disc pl-4 flex flex-col gap-1.5 text-[13px]">
                    <li><strong>1-Tap Bookmark:</strong> Tap the bookmark button in the viewer toolbar to immediately mark your active page.</li>
                    <li><strong>Score Canvas Ribbon:</strong> Bookmarked pages display an amber corner ribbon on the sheet canvas.</li>
                    <li><strong>Library Shortcuts:</strong> Quick pills on your library cards (e.g. <code>V (p.4)</code>) open directly to that movement.</li>
                    <li><strong>Bookmarks Side Rail:</strong> Open the Bookmarks tab on the right edge to name sections, jump around, or remove bookmarks.</li>
                  </ul>
                </div>
              </div>

              {/* Feature 3: Practice Loops (MusicXML) */}
              <div className="p-4 sm:p-5 rounded-2xl flex gap-4" style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(234, 88, 12, 0.16)', color: '#ea580c' }}>
                  <Repeat className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-base mb-1" style={{ color: 'var(--md-on-surface)' }}>Practice Loops & Play-Along (MusicXML)</h3>
                  <p className="mb-2 text-[13px]">Isolate and master difficult passages with interactive repetition:</p>
                  <ul className="list-disc pl-4 flex flex-col gap-1.5 text-[13px]">
                    <li><strong>Set IN & OUT Points:</strong> Click any note to set the <strong>IN (▶)</strong> cue, and Shift+Click or choose a measure to set the <strong>OUT (◀)</strong> cue.</li>
                    <li><strong>On-Score Cue Badges:</strong> Orange triangular badges appear directly above the notes on your score so you always see your loop boundaries. Tap a badge to clear it.</li>
                    <li><strong>Tempo & Metronome:</strong> Slow down tricky measures with the tempo slider, practice with a count-in metronome, and play continuously on loop.</li>
                    <li><strong>Save for Practice:</strong> Save active loops with custom names. Clicking a loop shortcut from your library jumps straight to those measures with loop markers ready to play.</li>
                  </ul>
                </div>
              </div>

              {/* Feature 4: Visual Tone & Lighting */}
              <div className="p-4 sm:p-5 rounded-2xl flex gap-4" style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255, 183, 77, 0.14)', color: 'var(--md-primary)' }}>
                  <Sliders className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-base mb-1" style={{ color: 'var(--md-on-surface)' }}>Stage Lighting & Score Contrast</h3>
                  <p className="mb-2 text-[13px]">Read clearly under blinding stage lights, dim orchestra pits, or outdoor gigs:</p>
                  <ul className="list-disc pl-4 flex flex-col gap-1.5 text-[13px]">
                    <li><strong>Ink Darkening:</strong> Intensifies faint scans and light pencil markings into crisp black so notes are easy to read from your stand.</li>
                    <li><strong>Lighting Presets:</strong> Instant one-tap switches for Warm Paper, Ivory, Sepia Cream, Night Mode, and Dark Pit.</li>
                    <li><strong>Eye Comfort Sliders:</strong> Fine-tune paper warmth, sepia tone, brightness, and contrast to eliminate glare and eye fatigue.</li>
                  </ul>
                </div>
              </div>

              {/* Feature 5: Storage & Offline Reliability */}
              <div className="p-4 sm:p-5 rounded-2xl flex gap-4" style={{ background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255, 183, 77, 0.14)', color: 'var(--md-primary)' }}>
                  <HardDrive className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-base mb-1" style={{ color: 'var(--md-on-surface)' }}>Repertoire & Offline Reliability</h3>
                  <p className="mb-2 text-[13px]">Keep your repertoire ready for any venue, with or without Wi-Fi:</p>
                  <ul className="list-disc pl-4 flex flex-col gap-1.5 text-[13px]">
                    <li><strong>100% Offline Ready:</strong> Scores are saved directly on your device so you can practice in basements and perform on stage without an internet connection.</li>
                    <li><strong>Google Drive Sync:</strong> Connect Google Drive to browse and open your sheet music collection from anywhere.</li>
                    <li><strong>Quick Search & Sort:</strong> Instantly search scores by title or find specific movements and rehearsal bookmarks.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className="flex justify-end px-6 sm:px-8 py-4"
              style={{ borderTop: '1px solid var(--md-outline-variant)' }}
            >
              <button
                onClick={() => setShowGuideModal(false)}
                className="md-btn-filled text-sm py-2 px-6 rounded-full font-semibold"
              >
                Ready to Play
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
