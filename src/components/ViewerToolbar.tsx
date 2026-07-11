import React, { useState } from 'react';
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
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({
  file, currentPage, totalPages,
  onPageChange, onBack,
  onToggleDisplay, onToggleSettings,
  isDisplayOpen, isSettingsOpen,
  onSaveOffline,
  zoom, onZoomIn, onZoomOut, onZoomReset
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
          <span className="material-symbols-outlined text-[22px] leading-none">arrow_back</span>
        </button>
        <div className="min-w-0 ml-1">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--md-on-surface)' }}>{file.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {file.offline ? (
              <span className="md-chip md-chip-success text-[10px] py-0.5 px-2 flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px] leading-none">check</span> Offline
              </span>
            ) : (
              <button
                onClick={onSaveOffline}
                className="flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors"
                style={{ background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)' }}
              >
                <span className="material-symbols-outlined text-[12px] leading-none">save</span> Save Offline
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
          <span className="material-symbols-outlined text-[22px] leading-none">chevron_left</span>
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
          <span className="material-symbols-outlined text-[22px] leading-none">chevron_right</span>
        </button>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        {/* Zoom controls */}
        <button
          onClick={onZoomOut}
          disabled={zoom <= 0.6}
          className="md-icon-btn disabled:opacity-30"
          title="Zoom out"
          style={{ width: 36, height: 36 }}
        >
          <span className="material-symbols-outlined text-[20px] leading-none">zoom_out</span>
        </button>

        <button
          onClick={onZoomReset}
          className="text-xs font-semibold px-1 py-1 rounded transition-colors hover:bg-white/10"
          style={{ color: 'var(--md-primary)', minWidth: 40, textAlign: 'center' }}
          title="Reset zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          onClick={onZoomIn}
          disabled={zoom >= 3.0}
          className="md-icon-btn disabled:opacity-30"
          title="Zoom in"
          style={{ width: 36, height: 36 }}
        >
          <span className="material-symbols-outlined text-[20px] leading-none">zoom_in</span>
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--md-outline-variant)', margin: '0 4px' }} />

        {file.source === 'google-drive' && (
          <button
            onClick={handleShare}
            className={`md-icon-btn ${shared ? 'active' : ''}`}
            title={shared ? 'Link copied!' : 'Copy share link'}
            style={{ width: 36, height: 36 }}
          >
            <span className="material-symbols-outlined text-[20px] leading-none">
              {shared ? 'check' : 'share'}
            </span>
          </button>
        )}

        <button
          onClick={onToggleDisplay}
          className={`md-icon-btn ${isDisplayOpen ? 'active' : ''}`}
          title="Page color & style"
          style={{ width: 36, height: 36 }}
        >
          <span className="material-symbols-outlined text-[20px] leading-none">palette</span>
        </button>

        <button
          onClick={onToggleSettings}
          className={`md-icon-btn ${isSettingsOpen ? 'active' : ''}`}
          title="Viewer settings"
          style={{ width: 36, height: 36 }}
        >
          <span className="material-symbols-outlined text-[20px] leading-none">settings</span>
        </button>

        <button
          onClick={toggleFullscreen}
          className="md-icon-btn"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          style={{ width: 36, height: 36 }}
        >
          <span className="material-symbols-outlined text-[20px] leading-none">
            {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
          </span>
        </button>
      </div>
    </div>
  );
};
export default ViewerToolbar;
