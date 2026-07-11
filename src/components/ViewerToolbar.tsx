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
  file, currentPage, totalPages,
  onPageChange, onBack,
  onToggleDisplay, onToggleSettings,
  isDisplayOpen, isSettingsOpen,
  onSaveOffline
}) => {
  const [jumpPage, setJumpPage] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shared, setShared] = useState(false);

  const handleShare = () => {
    const url = `${window.location.origin}/?driveId=${file.id}&name=${encodeURIComponent(file.name)}`;
    navigator.clipboard.writeText(url).then(() => {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(err => console.error(err));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPage, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      onPageChange(p);
      setJumpPage('');
    }
  };

  return (
    <div className="md-top-bar select-none" style={{ paddingLeft: 8, paddingRight: 8 }}>
      {/* Left: back + title */}
      <div className="flex items-center gap-1 flex-1 min-w-0 mr-2">
        <button onClick={onBack} className="md-icon-btn flex-shrink-0" title="Back to library">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 ml-1">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--md-on-surface)' }}>{file.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {file.offline ? (
              <span className="md-chip md-chip-success text-[10px]">
                <Check className="w-2.5 h-2.5" /> Offline
              </span>
            ) : (
              <button
                onClick={onSaveOffline}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors"
                style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }}
              >
                <Save className="w-2.5 h-2.5" /> Save Offline
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Center: page nav */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="md-icon-btn"
          style={{ width: 36, height: 36 }}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <form onSubmit={handleJumpSubmit} className="flex items-center gap-1">
          <input
            type="text"
            value={jumpPage}
            placeholder={String(currentPage)}
            onChange={e => setJumpPage(e.target.value.replace(/\D/g, ''))}
            className="w-10 h-8 text-center text-xs font-semibold rounded focus:outline-none"
            style={{
              background: 'var(--md-surface-3)',
              color: 'var(--md-on-surface)',
              border: '1px solid var(--md-outline-variant)',
            }}
          />
          <span className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>/ {totalPages}</span>
        </form>

        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="md-icon-btn"
          style={{ width: 36, height: 36 }}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        {file.source === 'google-drive' && (
          <button
            onClick={handleShare}
            className={`md-icon-btn ${shared ? 'active' : ''}`}
            title={shared ? 'Link copied!' : 'Copy share link'}
            style={{ width: 36, height: 36 }}
          >
            {shared ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          </button>
        )}

        <button
          onClick={onToggleDisplay}
          className={`md-icon-btn ${isDisplayOpen ? 'active' : ''}`}
          title="Display filters"
          style={{ width: 36, height: 36 }}
        >
          <Sliders className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleSettings}
          className={`md-icon-btn ${isSettingsOpen ? 'active' : ''}`}
          title="Viewer settings"
          style={{ width: 36, height: 36 }}
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          onClick={toggleFullscreen}
          className="md-icon-btn"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          style={{ width: 36, height: 36 }}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
export default ViewerToolbar;
