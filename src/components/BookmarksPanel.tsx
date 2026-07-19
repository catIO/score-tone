import React, { useState } from 'react';
import type { Bookmark, ScoreFile } from '../services/storageService';

interface BookmarksPanelProps {
  file: ScoreFile;
  bookmarks: Bookmark[];
  currentPage: number;
  onPageChange: (page: number) => void;
  onAddBookmark: (name: string, page: number) => void;
  onDeleteBookmark: (id: string) => void;
  onClose: () => void;
}

export const BookmarksPanel: React.FC<BookmarksPanelProps> = ({
  file,
  bookmarks = [],
  currentPage,
  onPageChange,
  onAddBookmark,
  onDeleteBookmark,
  onClose,
}) => {
  const [newBookmarkName, setNewBookmarkName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookmarkName.trim()) return;
    onAddBookmark(newBookmarkName.trim(), currentPage);
    setNewBookmarkName('');
  };

  const handleCopyLink = (bm: Bookmark, e: React.MouseEvent) => {
    e.stopPropagation();
    const linkUrl = file.source === 'google-drive'
      ? `${window.location.origin}/?driveId=${file.id}&name=${encodeURIComponent(file.name)}&page=${bm.page}`
      : `${window.location.origin}/?view=${file.id}&page=${bm.page}`;

    navigator.clipboard.writeText(linkUrl).then(() => {
      setCopiedId(bm.id);
      setTimeout(() => {
        setCopiedId(null);
      }, 1500);
    });
  };

  const sortedBookmarks = [...bookmarks].sort((a, b) => a.page - b.page);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, color: 'var(--md-on-surface)', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 14,
        marginBottom: 16,
        borderBottom: '1px solid var(--md-outline-variant)',
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>Bookmarks</h3>
        <button onClick={onClose} className="md-btn-text" style={{ padding: '4px 10px', fontSize: 12 }}>Close</button>
      </div>

      {/* Add Bookmark form */}
      <div style={{
        background: 'var(--md-surface-3)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 20,
        border: '1px solid var(--md-outline-variant)'
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--md-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Add to Page {currentPage}
        </p>
        <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="text"
            value={newBookmarkName}
            onChange={e => setNewBookmarkName(e.target.value)}
            placeholder="e.g. Movement II, Overture"
            maxLength={50}
            style={{
              padding: '8px 12px',
              fontSize: 13,
              borderRadius: 6,
              background: 'var(--md-surface-1)',
              color: 'var(--md-on-surface)',
              border: '1px solid var(--md-outline-variant)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!newBookmarkName.trim()}
            className="md-btn-filled"
            style={{
              padding: '8px 16px',
              fontSize: 12,
              borderRadius: 8,
              alignSelf: 'flex-end',
            }}
          >
            Add Bookmark
          </button>
        </form>
      </div>

      {/* Bookmarks List */}
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--md-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Bookmarks List
      </p>
      
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sortedBookmarks.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            textAlign: 'center',
            background: 'var(--md-surface-3)',
            borderRadius: 12,
            border: '1px dashed var(--md-outline-variant)',
            opacity: 0.7
          }}>
            <span className="material-symbols-outlined text-[32px]" style={{ color: 'var(--md-outline)', marginBottom: 8 }}>
              bookmark_border
            </span>
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--md-on-surface)' }}>No bookmarks yet</p>
            <p style={{ fontSize: 10, margin: '4px 0 0 0', color: 'var(--md-on-surface-variant)' }}>
              Create bookmarks for movements or sections to jump to them quickly.
            </p>
          </div>
        ) : (
          sortedBookmarks.map(bm => {
            const isActive = bm.page === currentPage;
            return (
              <div
                key={bm.id}
                onClick={() => onPageChange(bm.page)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: isActive ? 'var(--md-primary-container)' : 'var(--md-surface-3)',
                  border: isActive ? '1px solid var(--md-primary)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'background 150ms, border-color 150ms',
                }}
                className="group hover:bg-white/[0.04]"
              >
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, marginRight: 8 }}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isActive ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {bm.name}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: isActive ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
                    marginTop: 2,
                    opacity: isActive ? 0.9 : 0.7
                  }}>
                    Page {bm.page}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyLink(bm, e);
                    }}
                    className="md-icon-btn"
                    title={copiedId === bm.id ? "Copied!" : "Copy bookmark link"}
                    style={{
                      width: 32,
                      height: 32,
                      color: isActive ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
                      background: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                    }}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {copiedId === bm.id ? 'check' : 'link'}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBookmark(bm.id);
                    }}
                    className="md-icon-btn"
                    title="Delete bookmark"
                    style={{
                      width: 32,
                      height: 32,
                      color: isActive ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
                      background: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                    }}
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default BookmarksPanel;
