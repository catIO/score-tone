import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import type { ScoreFile } from '../services/storageService';
import { storageService } from '../services/storageService';
import type { AppSettings, FilterSettings } from '../services/settingsService';
import { pdfService, type PDFDocumentProxy } from '../services/pdfService';
import ViewerToolbar from './ViewerToolbar';
import PdfViewer from './PdfViewer';
import DisplayControls from './DisplayControls';
import SettingsPanel from './SettingsPanel';
import SvgFilters from './SvgFilters';
import { googleDriveService } from '../services/googleDriveService';
import { useWakeLock } from '../hooks/useWakeLock';

interface ViewerPageProps {
  file: ScoreFile;
  inMemoryBlob?: Blob;
  onBack: () => void;
  appSettings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  /** Called on every page turn so App.tsx can keep the URL ?page= param in sync */
  onPagePermalink?: (page: number) => void;
  /** Called when a Google Drive file's name/metadata changes are synced in the background */
  onFileMetadataUpdated?: (file: ScoreFile) => void;
}

export const ViewerPage: React.FC<ViewerPageProps> = ({
  file,
  inMemoryBlob,
  onBack,
  appSettings,
  onSettingsChange,
  onPagePermalink,
  onFileMetadataUpdated,
}) => {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(file.lastPage || 1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Panel display toggles — toolbar shown only when hovering the top zone
  const [toolbarVisible, setToolbarVisible] = useState<boolean>(false);
  const [isDisplayOpen, setIsDisplayOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Active filter state
  const [filters, setFilters] = useState<FilterSettings>(appSettings.customSliders);
  const [zoom, setZoom] = useState<number>(1.0);

  const hideTimerRef = useRef<number | null>(null);
  // Tracks last page-turn timestamp for Bluetooth pedal debouncing
  const lastKeyTurnRef = useRef<number>(0);
  // Touch gesture refs — pinch-to-zoom and swipe page navigation
  const pinchRef = useRef<{ dist: number; startZoom: number } | null>(null);
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const zoomRef = useRef(zoom);

  // Screen Wake Lock — keeps display on during a performance session
  const wakeLock = useWakeLock(appSettings.keepScreenAwake);

  const zoomIn = useCallback(() => setZoom(z => Math.min(3.0, z + 0.1)), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(0.6, z - 0.1)), []);
  const zoomReset = useCallback(() => setZoom(1.0), []);

  // Update browser tab title
  useEffect(() => {
    document.title = `${file.name} — Score Tone`;
    return () => {
      document.title = 'Score Tone';
    };
  }, [file.name]);

  // Load PDF file on mount
  useEffect(() => {
    let active = true;

    const loadPdf = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        let pdfData: Blob | string | null = null;

        // 1. Check inMemoryBlob (e.g. freshly opened local or freshly downloaded Drive file)
        if (inMemoryBlob) {
          pdfData = inMemoryBlob;
        } else {
          // 2. Fetch from IndexedDB if offline cached
          pdfData = await storageService.getFileData(file.id);
        }

        if (!pdfData) {
          // 3. Fallback: If it's a Google Drive file, try to download it on-the-fly
          if (file.source === 'google-drive') {
            pdfData = await googleDriveService.downloadFile(file.id);
          } else if (file.source === 'local') {
            throw new Error('Local temporary file has expired. Please reload it from the library.');
          }
        }

        if (!pdfData) {
          throw new Error('Could not retrieve file content.');
        }

        const doc = await pdfService.loadDocument(pdfData);
        if (active) {
          setPdfDoc(doc);
          setLoading(false);
          // Set to last page
          setCurrentPage(file.lastPage || 1);
        }
      } catch (err: any) {
        console.error(err);
        if (active) {
          setErrorMsg(err.message || 'Failed to open PDF score.');
          setLoading(false);
        }
      }
    };

    // Background metadata check (only for Google Drive files when online & has cached token)
    const syncMetadata = async () => {
      if (file.source !== 'google-drive' || !navigator.onLine) return;
      try {
        const token = googleDriveService.getCachedToken();
        if (!token) return;
        const meta = await googleDriveService.getFileMetadata(file.id, token);
        const updatedName = meta.name.replace(/\.pdf$/i, '');
        if (
          file.name !== updatedName ||
          file.size !== meta.size ||
          file.thumbnail !== meta.thumbnailLink
        ) {
          const updatedFile = {
            ...file,
            name: updatedName,
            size: meta.size,
            thumbnail: meta.thumbnailLink,
            modifiedTime: meta.modifiedTime
          };
          await storageService.saveFileMetadata(updatedFile);
          if (active) {
            onFileMetadataUpdated?.(updatedFile);
          }
        }
      } catch (err) {
        console.warn('[ScoreTone] Background metadata check failed:', err);
      }
    };

    loadPdf();
    syncMetadata();

    return () => {
      active = false;
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [file.id, inMemoryBlob]);

  // Save progress (last opened page) back to database and update URL permalink
  const handlePageChange = async (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    onPagePermalink?.(newPage);
    try {
      await storageService.saveFileMetadata({ ...file, lastPage: newPage, lastOpened: Date.now() });
    } catch (err) {
      console.warn('Failed to update page metadata', err);
    }
  };

  // Save the currently loaded in-memory blob to IndexedDB
  const handleSaveOffline = async () => {
    if (!inMemoryBlob) { setErrorMsg('Cannot cache: source data is missing.'); return; }
    setLoading(true);
    try {
      await storageService.cacheFileOffline(file, inMemoryBlob);
      file.offline = true;
    } catch (err: any) {
      setErrorMsg('Failed to save offline: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Show toolbar when mouse enters the hot-zone at top; hide after leaving with a delay
  const handleHotZoneEnter = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    setToolbarVisible(true);
  }, []);

  const handleHotZoneLeave = useCallback(() => {
    // Keep toolbar open if a side panel is open
    if (isDisplayOpen || isSettingsOpen) return;
    hideTimerRef.current = window.setTimeout(() => setToolbarVisible(false), 600);
  }, [isDisplayOpen, isSettingsOpen]);

  // Keep toolbar visible while a panel is open
  useEffect(() => {
    if (isDisplayOpen || isSettingsOpen) {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      setToolbarVisible(true);
    }
  }, [isDisplayOpen, isSettingsOpen]);

  // Keyboard Navigation & Bluetooth turn pedals
  useEffect(() => {
    const PEDAL_DEBOUNCE_MS = 250;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if focused on input elements (like page jump input)
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const isLandscape = containerRef.current ? containerRef.current.offsetWidth > containerRef.current.offsetHeight : false;
      const step = (appSettings.twoPageLandscape && isLandscape) ? 2 : 1;

      const isPageTurnKey = [
        'ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter',
        'ArrowLeft', 'ArrowUp', 'PageUp'
      ].includes(e.key);

      // Debounce page-turn keys to prevent double-page skips from sensitive
      // Bluetooth foot pedal switches that fire multiple keydown events.
      if (isPageTurnKey) {
        const now = Date.now();
        if (now - lastKeyTurnRef.current < PEDAL_DEBOUNCE_MS) {
          e.preventDefault();
          return;
        }
        lastKeyTurnRef.current = now;
      }

      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
          e.preventDefault();
          handlePageChange(Math.min(totalPages, currentPage + step));
          break;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
          e.preventDefault();
          handlePageChange(Math.max(1, currentPage - step));
          break;
        case '+': case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case '0':
          e.preventDefault();
          zoomReset();
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, appSettings.twoPageLandscape, zoomIn, zoomOut, zoomReset, zoom]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Keep zoomRef current so non-reactive touch handlers always read the latest zoom
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Touch gestures: pinch-to-zoom + swipe page navigation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const pinchDist = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = { dist: pinchDist(e.touches[0], e.touches[1]), startZoom: zoomRef.current };
        swipeRef.current = null;
      } else if (e.touches.length === 1) {
        swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault(); // block browser native zoom during pinch
        const newDist = pinchDist(e.touches[0], e.touches[1]);
        const ratio = newDist / pinchRef.current.dist;
        const newZoom = Math.min(3.0, Math.max(0.6, pinchRef.current.startZoom * ratio));
        setZoom(newZoom);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      // Swipe navigation — only active when not zoomed in
      if (e.touches.length === 0 && swipeRef.current && zoomRef.current <= 1.0) {
        const { x, y, t } = swipeRef.current;
        const dx = e.changedTouches[0].clientX - x;
        const dy = e.changedTouches[0].clientY - y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - t < 400) {
          const isLandscape = el.offsetWidth > el.offsetHeight;
          const step = (appSettings.twoPageLandscape && isLandscape) ? 2 : 1;
          handlePageChange(dx < 0
            ? Math.min(totalPages, currentPage + step)
            : Math.max(1, currentPage - step));
        }
      }
      if (e.touches.length < 2) pinchRef.current = null;
      if (e.touches.length === 0) swipeRef.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [currentPage, totalPages, appSettings.twoPageLandscape]);

  const handleScreenTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const target = e.target as HTMLElement;

    // Click outside sidebars to close them
    if (isDisplayOpen || isSettingsOpen) {
      if (!target.closest('.sidebar-control-panel') && !target.closest('.md-top-bar')) {
        setIsDisplayOpen(false);
        setIsSettingsOpen(false);
        return; // Consume click to prevent accidental page turn
      }
    }

    if (target.closest('.sidebar-control-panel') || target.closest('.md-top-bar') || target.closest('button') || target.closest('input')) return;

    const { clientX } = e;
    const { offsetWidth, offsetHeight } = containerRef.current;
    const boundary = (appSettings.tapZoneWidth / 100) * offsetWidth;
    const step = (appSettings.twoPageLandscape && offsetWidth > offsetHeight) ? 2 : 1;

    if (clientX < boundary) {
      handlePageChange(Math.max(1, currentPage - step));
    } else if (clientX > offsetWidth - boundary) {
      handlePageChange(Math.min(totalPages, currentPage + step));
    }
  };

  // Handle individual filter slider updates
  const handleFiltersChange = (newFilters: FilterSettings) => {
    setFilters(newFilters);

    onSettingsChange({
      ...appSettings,
      customSliders: newFilters
    });
  };

  const handleSettingsChangeLocal = (newSettings: AppSettings) => {
    onSettingsChange(newSettings);
  };

  // Dynamically map CSS filter values
  const cssFilterString = React.useMemo(() => {
    let str = `sepia(${filters.sepia}%) brightness(${filters.brightness}%) contrast(${filters.contrast}%)`;
    if (filters.invert) {
      str += ' invert(100%)';
    }
    if (filters.highContrast) {
      str += ' contrast(150%) saturate(80%)';
    }
    if (filters.inkDarkness > 0) {
      str += ' url(#scoretone-ink-darkness)';
    }
    return str;
  }, [filters]);

  // Warm tint background overlay configuration
  const tintStyle = React.useMemo(() => {
    if (filters.warmth <= 0 && filters.sepia <= 0) return {};

    // Map warmth and sepia to an warm amber multiply overlay color
    const opacity = Math.max(filters.warmth, filters.sepia) / 250; // max 0.4 opacity
    return {
      backgroundColor: '#ff9c3a',
      opacity: opacity,
      mixBlendMode: 'multiply' as const,
      pointerEvents: 'none' as const,
      position: 'absolute' as const,
      inset: 0,
      zIndex: 5
    };
  }, [filters.warmth, filters.sepia]);

  if (loading && !pdfDoc) {
    return (
      <div className="page-container flex flex-col items-center justify-center h-screen gap-4"
        style={{ background: 'var(--md-surface)', color: 'var(--md-on-surface-variant)' }}>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--md-primary)' }} />
        <p className="text-sm font-medium">Opening score…</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="page-container flex flex-col items-center justify-center h-screen p-6 text-center gap-6"
        style={{ background: 'var(--md-surface)', color: 'var(--md-on-surface)' }}>
        <AlertTriangle className="w-12 h-12" style={{ color: 'var(--md-error)' }} />
        <div className="max-w-md">
          <h2 className="text-lg font-bold mb-2">Failed to open PDF</h2>
          <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>{errorMsg}</p>
        </div>
        <button onClick={onBack} className="md-btn-tonal flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={handleScreenTap}
      className="page-container relative w-full h-screen overflow-hidden select-none"
      style={{ background: '#111' }}
    >
      <SvgFilters inkDarkness={filters.inkDarkness} />

      {/* Invisible hover hot-zone at top — triggers toolbar */}
      <div
        className="absolute top-0 left-0 right-0 z-50"
        style={{ height: '20vh' }}
        onMouseEnter={handleHotZoneEnter}
        onMouseLeave={handleHotZoneLeave}
      >
        {/* Toolbar slides in/out within hot-zone */}
        <div
          style={{
            transform: toolbarVisible ? 'translateY(0)' : 'translateY(-100%)',
            opacity: toolbarVisible ? 1 : 0,
            transition: 'transform 200ms ease, opacity 200ms ease',
            pointerEvents: toolbarVisible ? 'auto' : 'none',
          }}
        >
          <ViewerToolbar
            file={file}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            onBack={onBack}
            onToggleDisplay={() => { setIsDisplayOpen(p => !p); setIsSettingsOpen(false); }}
            onToggleSettings={() => { setIsSettingsOpen(p => !p); setIsDisplayOpen(false); }}
            isDisplayOpen={isDisplayOpen}
            isSettingsOpen={isSettingsOpen}
            onSaveOffline={handleSaveOffline}
            zoom={zoom}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onZoomReset={zoomReset}
          />
        </div>
      </div>

      {/* PDF viewport */}
      <div className="w-full h-full relative"
        style={{ '--pdf-bg': filters.backgroundColor, '--pdf-mix-blend': 'multiply' } as React.CSSProperties}>
        <div style={tintStyle} />
        <div className="w-full h-full" style={{ filter: cssFilterString, transition: 'filter 150ms' }}>
          {pdfDoc && (
            <PdfViewer
              pdfDoc={pdfDoc}
              currentPage={currentPage}
              onPageChange={handlePageChange}
              fitMode={appSettings.fitMode}
              scrollMode={appSettings.scrollMode}
              twoPageLandscape={appSettings.twoPageLandscape}
              onTotalPages={setTotalPages}
              zoom={zoom}
            />
          )}
        </div>
      </div>

      {/* Display Controls sidebar */}
      <div
        className="sidebar-control-panel absolute right-0 bottom-0 overflow-y-auto"
        style={{
          top: 64,
          width: 288,
          background: 'var(--md-surface-2)',
          borderLeft: '1px solid var(--md-outline-variant)',
          padding: '16px',
          transform: isDisplayOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 250ms ease',
          zIndex: 60
        }}
      >
        <DisplayControls
          filters={filters}
          onFiltersChange={handleFiltersChange}
        />
      </div>

      {/* Settings sidebar */}
      <div
        className="sidebar-control-panel absolute right-0 bottom-0 overflow-y-auto"
        style={{
          top: 64,
          width: 288,
          background: 'var(--md-surface-2)',
          borderLeft: '1px solid var(--md-outline-variant)',
          padding: '16px',
          transform: isSettingsOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 250ms ease',
          zIndex: 60
        }}
      >
        <SettingsPanel
          settings={appSettings}
          onChange={handleSettingsChangeLocal}
          onClose={() => setIsSettingsOpen(false)}
          wakeLockActive={wakeLock.isActive}
          wakeLockSupported={wakeLock.isSupported}
        />
      </div>

      {/* Page indicator — always visible, bottom center */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold pointer-events-none"
        style={{
          background: 'rgba(0,0,0,0.5)',
          color: 'rgba(255,255,255,0.6)',
          backdropFilter: 'none',
        }}
      >
        {currentPage} / {totalPages}
      </div>
    </div>
  );
};
export default ViewerPage;
