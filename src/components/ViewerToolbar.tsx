import React, { useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Sliders, Settings, Maximize2, Minimize2, Check, Save, Share2 } from 'lucide-react';
import type { ScoreFile } from '../services/storageService';

interface ViewerToolbarProps {
  file: ScoreFile;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onBack: () => void;
  onToggleDisplay: () => void;
  onToggleSettings: () => void;
  isDisplayOpen: boolean;
  isSettingsOpen: boolean;
  onSaveOffline: () => void;
}

export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({
  file,
  currentPage,
  totalPages,
  onPageChange,
  onBack,
  onToggleDisplay,
  onToggleSettings,
  isDisplayOpen,
  isSettingsOpen,
  onSaveOffline
}) => {
  const [jumpPage, setJumpPage] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shared, setShared] = useState(false);

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/?driveId=${file.id}&name=${encodeURIComponent(file.name)}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('Fullscreen failed', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpPage, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      setJumpPage('');
    }
  };

  return (
    <div
      className="glass-panel w-full flex items-center justify-between px-4 py-3 md:px-6 z-40 border-b border-white/10 select-none animate-fade"
      style={{
        boxShadow: 'var(--shadow-md)'
      }}
    >
      {/* Back and title */}
      <div className="flex items-center gap-3 md:gap-4 max-w-[35%]">
        <button
          onClick={onBack}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-300 hover:text-white"
          title="Return to library"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h2 className="text-sm md:text-base font-semibold truncate text-slate-100">{file.name}</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            {file.offline ? (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                <Check className="w-3 h-3" /> Offline Saved
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveOffline();
                }}
                className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 hover:bg-amber-500/25 transition-all"
                title="Save this score offline to IndexedDB"
              >
                <Save className="w-3 h-3 text-amber-400 animate-pulse" /> Save for Offline
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Center navigation */}
      <div className="flex items-center gap-2 md:gap-4">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <form onSubmit={handleJumpSubmit} className="flex items-center gap-1 text-slate-200">
          <input
            type="text"
            placeholder={String(currentPage)}
            value={jumpPage}
            onChange={(e) => setJumpPage(e.target.value.replace(/\D/g, ''))}
            className="w-10 h-7 text-center text-xs font-semibold bg-slate-900 border border-white/10 rounded focus:outline-none focus:border-indigo-500 text-white placeholder-slate-300"
          />
          <span className="text-xs text-slate-400 font-medium">/ {totalPages}</span>
        </form>

        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 md:gap-2">
        {file.source === 'google-drive' && (
          <button
            onClick={handleShare}
            className={`p-2 rounded-full transition-colors ${
              shared
                ? 'bg-emerald-600 text-white shadow shadow-emerald-600/30'
                : 'hover:bg-white/10 text-slate-300 hover:text-white'
            }`}
            title={shared ? "Link Copied!" : "Copy Share Link"}
          >
            {shared ? <Check className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
          </button>
        )}

        <button
          onClick={onToggleDisplay}
          className={`p-2 rounded-full transition-colors ${
            isDisplayOpen
              ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30'
              : 'hover:bg-white/10 text-slate-300 hover:text-white'
          }`}
          title="Display filters"
        >
          <Sliders className="w-5 h-5" />
        </button>

        <button
          onClick={onToggleSettings}
          className={`p-2 rounded-full transition-colors ${
            isSettingsOpen
              ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30'
              : 'hover:bg-white/10 text-slate-300 hover:text-white'
          }`}
          title="Viewer settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-2 hover:bg-white/10 rounded-full text-slate-300 hover:text-white"
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};
export default ViewerToolbar;
