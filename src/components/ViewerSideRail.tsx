import React from 'react';

interface ViewerSideRailProps {
  isBookmarksOpen: boolean;
  onToggleBookmarks: () => void;
  bookmarksCount: number;
  isCurrentPageBookmarked: boolean;
  isDisplayOpen: boolean;
  onToggleDisplay: () => void;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  visible: boolean;
  isAnyPanelOpen: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const ViewerSideRail: React.FC<ViewerSideRailProps> = ({
  isBookmarksOpen,
  onToggleBookmarks,
  bookmarksCount,
  isCurrentPageBookmarked,
  isDisplayOpen,
  onToggleDisplay,
  isSettingsOpen,
  onToggleSettings,
  visible,
  isAnyPanelOpen,
  onMouseEnter,
  onMouseLeave,
}) => {
  return (
    <div
      className="select-none flex flex-col items-center gap-2 p-1.5 rounded-2xl side-rail-panel"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'absolute',
        top: 76,
        right: isAnyPanelOpen ? 296 : 12,
        background: 'rgba(29, 27, 24, 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--md-outline-variant)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        zIndex: 70,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(24px)',
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'right 250ms cubic-bezier(0.2, 0, 0, 1), transform 200ms ease, opacity 200ms ease',
      }}
    >
      {/* Bookmarks Toggle */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={onToggleBookmarks}
          className={`md-icon-btn ${isBookmarksOpen ? 'active' : ''}`}
          title={`Bookmarks & Loops (${bookmarksCount})`}
          style={{
            width: 40,
            height: 40,
            color: isBookmarksOpen ? 'var(--md-on-primary-container)' : isCurrentPageBookmarked ? 'var(--md-primary)' : 'var(--md-on-surface-variant)',
          }}
        >
          <span
            className="material-symbols-outlined text-[20px] leading-none"
            style={{
              fontVariationSettings: isCurrentPageBookmarked || isBookmarksOpen ? "'FILL' 1" : "'FILL' 0",
            }}
          >
            bookmark
          </span>
        </button>

        {/* Total Bookmarks Count Badge */}
        {bookmarksCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center text-[10px] font-bold rounded-full pointer-events-none"
            style={{
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              background: isCurrentPageBookmarked ? 'var(--md-primary)' : 'var(--md-surface-3)',
              color: isCurrentPageBookmarked ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
              border: '1px solid var(--md-outline-variant)',
              lineHeight: 1,
            }}
          >
            {bookmarksCount}
          </span>
        )}
      </div>

      {/* Page Tone & Display Controls Toggle */}
      <button
        onClick={onToggleDisplay}
        className={`md-icon-btn ${isDisplayOpen ? 'active' : ''}`}
        title="Page Tone & Display"
        style={{ width: 40, height: 40 }}
      >
        <span className="material-symbols-outlined text-[20px] leading-none">palette</span>
      </button>

      {/* Viewer Settings Toggle */}
      <button
        onClick={onToggleSettings}
        className={`md-icon-btn ${isSettingsOpen ? 'active' : ''}`}
        title="Viewer Settings"
        style={{ width: 40, height: 40 }}
      >
        <span className="material-symbols-outlined text-[20px] leading-none">settings</span>
      </button>
    </div>
  );
};

export default ViewerSideRail;
