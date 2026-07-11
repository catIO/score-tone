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

interface ViewerPageProps {
  file: ScoreFile;
  inMemoryBlob?: Blob; // Present if temporarily loaded or downloaded from Google Drive
  onBack: () => void;
  appSettings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

export const ViewerPage: React.FC<ViewerPageProps> = ({
  file,
  inMemoryBlob,
  onBack,
  appSettings,
  onSettingsChange
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
  const [presetName, setPresetName] = useState<string>(appSettings.lastPreset);

  const hideTimerRef = useRef<number | null>(null);

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
          // If not in DB and no inMemoryBlob, we can try using the file.id as URL (fallback case)
          if (file.source === 'local') {
            throw new Error('Local temporary file has expired. Please reload it from the library.');
          } else {
            throw new Error('This file has not been saved for offline use. Return to Library and connect to Google Drive.');
          }
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

    loadPdf();

    return () => {
      active = false;
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [file.id, inMemoryBlob]);

  // Save progress (last opened page) back to database
  const handlePageChange = async (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
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
    const handleKeyDown = (e: KeyboardEvent) => {
      const isLandscape = containerRef.current ? containerRef.current.offsetWidth > containerRef.current.offsetHeight : false;
      const step = (appSettings.twoPageLandscape && isLandscape) ? 2 : 1;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
          e.preventDefault();
          handlePageChange(Math.min(totalPages, currentPage + step));
          break;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
          e.preventDefault();
          handlePageChange(Math.max(1, currentPage - step));
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, appSettings.twoPageLandscape]);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleScreenTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const target = e.target as HTMLElement;
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

  // Handle Preset updates
  const handlePresetSelect = (name: string, newFilters: FilterSettings) => {
    setPresetName(name);
    setFilters(newFilters);
    
    // Save to settings
    onSettingsChange({
      ...appSettings,
      lastPreset: name,
      customSliders: newFilters
    });
  };

  // Handle individual filter slider updates
  const handleFiltersChange = (newFilters: FilterSettings) => {
    setPresetName('Custom');
    setFilters(newFilters);

    onSettingsChange({
      ...appSettings,
      lastPreset: 'Custom',
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
        style={{ height: 56 }}
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
            />
          )}
        </div>
      </div>

      {/* Display Controls sidebar */}
      <div
        className="sidebar-control-panel absolute right-0 bottom-0 z-30 overflow-y-auto"
        style={{
          top: 64,
          width: 288,
          background: 'var(--md-surface-2)',
          borderLeft: '1px solid var(--md-outline-variant)',
          padding: '16px',
          transform: isDisplayOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 250ms ease',
        }}
      >
        <DisplayControls
          filters={filters}
          presetName={presetName}
          onFiltersChange={handleFiltersChange}
          onPresetSelect={handlePresetSelect}
        />
      </div>

      {/* Settings sidebar */}
      <div
        className="sidebar-control-panel absolute right-0 bottom-0 z-30 overflow-y-auto"
        style={{
          top: 64,
          width: 288,
          background: 'var(--md-surface-2)',
          borderLeft: '1px solid var(--md-outline-variant)',
          padding: '16px',
          transform: isSettingsOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 250ms ease',
        }}
      >
        <SettingsPanel
          settings={appSettings}
          onChange={handleSettingsChangeLocal}
          onClose={() => setIsSettingsOpen(false)}
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
