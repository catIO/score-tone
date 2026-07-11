import React, { useState, useEffect, useRef } from 'react';
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

  // Panel display toggles
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isDisplayOpen, setIsDisplayOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Active filter state
  const [filters, setFilters] = useState<FilterSettings>(appSettings.customSliders);
  const [presetName, setPresetName] = useState<string>(appSettings.lastPreset);

  const controlsTimeoutRef = useRef<number | null>(null);

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
    resetControlsTimeout();

    return () => {
      active = false;
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [file.id, inMemoryBlob]);

  // Save progress (last opened page) back to database
  const handlePageChange = async (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    
    // Save page index inside IndexedDB
    try {
      const updatedMetadata = { ...file, lastPage: newPage, lastOpened: Date.now() };
      await storageService.saveFileMetadata(updatedMetadata);
    } catch (err) {
      console.warn('Failed to update recent page metadata', err);
    }
  };

  // Save the currently loaded in-memory blob to IndexedDB
  const handleSaveOffline = async () => {
    if (!inMemoryBlob) {
      setErrorMsg('Cannot cache this file: source data is missing.');
      return;
    }
    
    setLoading(true);
    try {
      await storageService.cacheFileOffline(file, inMemoryBlob);
      file.offline = true; // Mutate local reference for immediate rendering
      resetControlsTimeout();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to save file locally: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Keyboard Navigation & Bluetooth turn pedals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Pedals send PageUp/PageDown, arrows, or space/enter
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
        case 'Enter':
          e.preventDefault();
          handlePageChange(Math.min(totalPages, currentPage + (appSettings.twoPageLandscape && containerRef.current?.offsetWidth! > containerRef.current?.offsetHeight! ? 2 : 1)));
          resetControlsTimeout();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          handlePageChange(Math.max(1, currentPage - (appSettings.twoPageLandscape && containerRef.current?.offsetWidth! > containerRef.current?.offsetHeight! ? 2 : 1)));
          resetControlsTimeout();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, appSettings.twoPageLandscape]);

  // Touch screen tap zone navigation
  const containerRef = useRef<HTMLDivElement>(null);
  
  const handleScreenTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    // Ignore taps inside toolbars or sidebar panels
    const target = e.target as HTMLElement;
    if (target.closest('.glass-panel') || target.closest('.sidebar-control-panel') || target.closest('button') || target.closest('input')) {
      return;
    }

    const { clientX } = e;
    const { offsetWidth } = containerRef.current;
    const boundary = (appSettings.tapZoneWidth / 100) * offsetWidth;

    const isLandscapeLayout = offsetWidth > containerRef.current.offsetHeight;
    const stepSize = (appSettings.twoPageLandscape && isLandscapeLayout) ? 2 : 1;

    if (clientX < boundary) {
      // Tap Left -> Previous page
      handlePageChange(Math.max(1, currentPage - stepSize));
      resetControlsTimeout();
    } else if (clientX > offsetWidth - boundary) {
      // Tap Right -> Next page
      handlePageChange(Math.min(totalPages, currentPage + stepSize));
      resetControlsTimeout();
    } else {
      // Tap Center -> Toggle interface controls
      setShowControls((prev) => !prev);
    }
  };

  // Mouse Move listener to auto show/hide controls
  const handleMouseMove = () => {
    if (!showControls) {
      setShowControls(true);
    }
    resetControlsTimeout();
  };

  // Timer to autohide controls
  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }

    if (!appSettings.autoHideControls || isDisplayOpen || isSettingsOpen) {
      return;
    }

    controlsTimeoutRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 3500);
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

  // Trigger settings adjustments
  const handleSettingsChangeLocal = (newSettings: AppSettings) => {
    onSettingsChange(newSettings);
    // If autohide was toggled off, make sure controls show up
    if (!newSettings.autoHideControls) {
      setShowControls(true);
    }
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
      <div className="page-container bg-slate-950 flex flex-col items-center justify-center text-white h-screen gap-4">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
        <p className="text-slate-400 text-sm font-semibold font-display">Opening music score...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="page-container bg-slate-950 flex flex-col items-center justify-center text-white h-screen p-6 text-center gap-6">
        <AlertTriangle className="w-16 h-16 text-rose-500" />
        <div className="space-y-2 max-w-md">
          <h2 className="text-xl font-bold font-display">Failed to Open PDF</h2>
          <p className="text-slate-400 text-sm">{errorMsg}</p>
        </div>
        <button
          onClick={onBack}
          className="btn btn-secondary flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Library
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={handleScreenTap}
      className="page-container relative w-full h-screen overflow-hidden select-none bg-slate-950"
    >
      {/* Dynamic Global Ink Filter */}
      <SvgFilters inkDarkness={filters.inkDarkness} />

      {/* Header Toolbar */}
      <div
        className={`absolute top-0 left-0 right-0 z-40 transition-all duration-300 transform ${
          showControls ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <ViewerToolbar
          file={file}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onBack={onBack}
          onToggleDisplay={() => {
            setIsDisplayOpen(!isDisplayOpen);
            setIsSettingsOpen(false);
            resetControlsTimeout();
          }}
          onToggleSettings={() => {
            setIsSettingsOpen(!isSettingsOpen);
            setIsDisplayOpen(false);
            resetControlsTimeout();
          }}
          isDisplayOpen={isDisplayOpen}
          isSettingsOpen={isSettingsOpen}
          onSaveOffline={handleSaveOffline}
        />
      </div>

      {/* PDF Viewport Layer */}
      <div
        className="w-full h-full relative"
        style={
          {
            '--pdf-bg': filters.backgroundColor,
            '--pdf-mix-blend': 'multiply'
          } as React.CSSProperties
        }
      >
        {/* Warm Overlay Element */}
        <div style={tintStyle} />

        {/* Inner viewport container applying CSS Filters */}
        <div
          className="w-full h-full"
          style={{
            filter: cssFilterString,
            transition: 'filter var(--transition-fast)'
          }}
        >
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

      {/* Display Controls Sidebar */}
      <div
        className={`sidebar-control-panel absolute right-0 top-[65px] bottom-0 w-80 glass-panel z-30 transition-transform duration-300 transform border-l border-white/10 p-5 ${
          isDisplayOpen && showControls ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <DisplayControls
          filters={filters}
          presetName={presetName}
          onFiltersChange={handleFiltersChange}
          onPresetSelect={handlePresetSelect}
        />
      </div>

      {/* App Settings Sidebar */}
      <div
        className={`sidebar-control-panel absolute right-0 top-[65px] bottom-0 w-80 glass-panel z-30 transition-transform duration-300 transform border-l border-white/10 p-5 ${
          isSettingsOpen && showControls ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <SettingsPanel
          settings={appSettings}
          onChange={handleSettingsChangeLocal}
          onClose={() => {
            setIsSettingsOpen(false);
            resetControlsTimeout();
          }}
        />
      </div>

      {/* Floating Page Number Indicator (shown when controls are hidden) */}
      <div
        className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-semibold glass-panel text-slate-300 border border-white/5 transition-opacity duration-300 pointer-events-none ${
          !showControls ? 'opacity-80' : 'opacity-0'
        }`}
      >
        {currentPage} / {totalPages}
      </div>
    </div>
  );
};
export default ViewerPage;
