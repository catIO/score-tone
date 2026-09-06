import React, { useState } from 'react';
import type { Bookmark, ScoreFile } from '../services/storageService';
import type { LoopRange, PlaybackState } from '../services/audioPlaybackService';
import { Repeat, Bookmark as BookmarkIcon, Play, Link, Trash2, Check } from 'lucide-react';

interface BookmarksPanelProps {
  file: ScoreFile;
  bookmarks: Bookmark[];
  currentPage: number;
  onPageChange: (page: number) => void;
  onAddBookmark: (name: string, page: number) => void;
  onAddLoopBookmark?: (name: string, loopRange: LoopRange, bpm?: number) => void;
  onSelectLoopBookmark?: (bm: Bookmark) => void;
  onDeleteBookmark: (id: string) => void;
  onClose: () => void;
  playbackState?: PlaybackState;
  isMusicXml?: boolean;
}

export const BookmarksPanel: React.FC<BookmarksPanelProps> = ({
  file,
  bookmarks = [],
  currentPage,
  onPageChange,
  onAddBookmark,
  onAddLoopBookmark,
  onSelectLoopBookmark,
  onDeleteBookmark,
  onClose,
  playbackState,
  isMusicXml = false,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'loops' | 'pages'>('all');
  const [newPageBookmarkName, setNewPageBookmarkName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const currentPageBookmark = bookmarks.find(bm => bm.page === currentPage && bm.type !== 'loop');

  const handleAddPageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPageBookmarkName.trim() || `Page ${currentPage}`;
    onAddBookmark(name, currentPage);
    setNewPageBookmarkName('');
  };

  const handleCopyLink = (bm: Bookmark, e: React.MouseEvent) => {
    e.stopPropagation();
    let linkUrl = '';
    const baseParams = file.source === 'google-drive'
      ? `driveId=${file.id}&name=${encodeURIComponent(file.name)}&page=${bm.page}`
      : `view=${file.id}&page=${bm.page}`;

    if (bm.type === 'loop' && bm.loopRange) {
      const loopParams = new URLSearchParams({
        loopStartBeat: String(bm.loopRange.startBeat),
        loopEndBeat: String(bm.loopRange.endBeat),
        ...(bm.loopRange.startMeasure !== undefined ? { loopStartM: String(bm.loopRange.startMeasure) } : {}),
        ...(bm.loopRange.endMeasure !== undefined ? { loopEndM: String(bm.loopRange.endMeasure) } : {}),
        ...(bm.bpm ? { bpm: String(bm.bpm) } : {}),
      }).toString();
      linkUrl = `${window.location.origin}/?${baseParams}&${loopParams}`;
    } else {
      linkUrl = `${window.location.origin}/?${baseParams}`;
    }

    navigator.clipboard.writeText(linkUrl).then(() => {
      setCopiedId(bm.id);
      setTimeout(() => {
        setCopiedId(null);
      }, 1500);
    });
  };

  const handleItemClick = (bm: Bookmark) => {
    if (bm.type === 'loop' && bm.loopRange && onSelectLoopBookmark) {
      onSelectLoopBookmark(bm);
    } else {
      onPageChange(bm.page);
    }
  };

  const filteredBookmarks = bookmarks.filter(bm => {
    if (activeTab === 'loops') return bm.type === 'loop';
    if (activeTab === 'pages') return bm.type !== 'loop';
    return true;
  });

  const loopBookmarksCount = bookmarks.filter(b => b.type === 'loop').length;
  const pageBookmarksCount = bookmarks.filter(b => b.type !== 'loop').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, color: 'var(--md-on-surface)', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 14,
        marginBottom: 14,
        borderBottom: '1px solid var(--md-outline-variant)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookmarkIcon className="w-4 h-4 text-orange-400" />
          <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Outfit, sans-serif', margin: 0 }}>Bookmarks & Loops</h3>
        </div>
        <button onClick={onClose} className="md-btn-text" style={{ padding: '4px 10px', fontSize: 12 }}>Close</button>
      </div>

      {/* Add Page Bookmark / Current Page Status card */}
      {currentPageBookmark ? (
        <div style={{
          background: 'rgba(255, 183, 77, 0.08)',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 16,
          border: '1px solid rgba(255, 183, 77, 0.35)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, marginRight: 8 }}>
              <BookmarkIcon className="w-4 h-4 text-[var(--md-primary)] flex-shrink-0" />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--md-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                  Page {currentPage} Bookmarked
                </p>
                <p style={{ fontSize: 12, color: 'var(--md-on-surface)', margin: '2px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentPageBookmark.name}
                </p>
              </div>
            </div>
            <button
              onClick={() => onDeleteBookmark(currentPageBookmark.id)}
              className="text-xs font-semibold px-2.5 py-1 rounded transition-colors flex-shrink-0"
              style={{ background: 'rgba(255, 180, 171, 0.12)', color: 'var(--md-error)', border: '1px solid rgba(255, 180, 171, 0.25)' }}
              title="Remove bookmark for this page"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--md-surface-3)',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 16,
          border: '1px solid var(--md-outline-variant)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--md-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Bookmark Page {currentPage}
            </p>
            <button
              type="button"
              onClick={() => onAddBookmark(`Page ${currentPage}`, currentPage)}
              className="md-btn-filled"
              style={{
                padding: '4px 10px',
                fontSize: 11,
                borderRadius: 8,
                fontWeight: 600,
              }}
              title="Quickly bookmark this page"
            >
              + Quick Add
            </button>
          </div>
          <form onSubmit={handleAddPageSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              value={newPageBookmarkName}
              onChange={e => setNewPageBookmarkName(e.target.value)}
              placeholder="Custom label (e.g. Movement II, Coda)"
              maxLength={50}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: 6,
                background: 'var(--md-surface-1)',
                color: 'var(--md-on-surface)',
                border: '1px solid var(--md-outline-variant)',
                outline: 'none',
              }}
            />
            {newPageBookmarkName.trim() && (
              <button
                type="submit"
                className="md-btn-filled"
                style={{
                  padding: '5px 12px',
                  fontSize: 11,
                  borderRadius: 8,
                  alignSelf: 'flex-end',
                }}
              >
                Save Named Bookmark
              </button>
            )}
          </form>
        </div>
      )}

      {/* Filter Tabs if both types exist or score is MusicXML */}
      {isMusicXml && bookmarks.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              flex: 1,
              padding: '5px 8px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'all' ? 'var(--md-primary-container)' : 'var(--md-surface-3)',
              color: activeTab === 'all' ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
              transition: 'background 150ms',
            }}
          >
            All ({bookmarks.length})
          </button>
          <button
            onClick={() => setActiveTab('loops')}
            style={{
              flex: 1,
              padding: '5px 8px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'loops' ? 'rgba(234, 88, 12, 0.25)' : 'var(--md-surface-3)',
              color: activeTab === 'loops' ? '#fb923c' : 'var(--md-on-surface-variant)',
              transition: 'background 150ms',
            }}
          >
            Loops ({loopBookmarksCount})
          </button>
          <button
            onClick={() => setActiveTab('pages')}
            style={{
              flex: 1,
              padding: '5px 8px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'pages' ? 'var(--md-primary-container)' : 'var(--md-surface-3)',
              color: activeTab === 'pages' ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
              transition: 'background 150ms',
            }}
          >
            Pages ({pageBookmarksCount})
          </button>
        </div>
      )}

      {/* Bookmarks List */}
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--md-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, margin: '0 0 8px 0' }}>
        Saved Practice Sections
      </p>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredBookmarks.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '30px 16px',
            textAlign: 'center',
            background: 'var(--md-surface-3)',
            borderRadius: 12,
            border: '1px dashed var(--md-outline-variant)',
            opacity: 0.7
          }}>
            <BookmarkIcon className="w-8 h-8 text-slate-400 mb-2" />
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--md-on-surface)' }}>
              {activeTab === 'loops' ? 'No loop bookmarks yet' : 'No bookmarks yet'}
            </p>
            <p style={{ fontSize: 10, margin: '4px 0 0 0', color: 'var(--md-on-surface-variant)' }}>
              {isMusicXml
                ? 'Select a loop section with Shift+Click and bookmark it to quickly practice later.'
                : 'Create bookmarks for movements or sections to jump to them quickly.'}
            </p>
          </div>
        ) : (
          filteredBookmarks.map(bm => {
            const isLoop = bm.type === 'loop';
            const isLoopMatching = isLoop &&
              playbackState?.loopRange &&
              playbackState.loopRange.startBeat === bm.loopRange?.startBeat &&
              playbackState.loopRange.endBeat === bm.loopRange?.endBeat;
            const isPageActive = !isLoop && bm.page === currentPage;
            const isSelected = isLoop ? isLoopMatching : isPageActive;

            return (
              <div
                key={bm.id}
                onClick={() => handleItemClick(bm)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: isSelected
                    ? (isLoop ? 'rgba(234, 88, 12, 0.2)' : 'var(--md-primary-container)')
                    : 'var(--md-surface-3)',
                  border: isSelected
                    ? (isLoop ? '1px solid #ea580c' : '1px solid var(--md-primary)')
                    : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
                className="group hover:bg-white/[0.06]"
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: 1, marginRight: 6 }}>
                  {isLoop ? (
                    <div style={{
                      marginTop: 2,
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: 'rgba(234, 88, 12, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Repeat className="w-3.5 h-3.5 text-orange-400" />
                    </div>
                  ) : (
                    <div style={{
                      marginTop: 2,
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: 'rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <BookmarkIcon className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isSelected
                        ? (isLoop ? '#fb923c' : 'var(--md-on-primary-container)')
                        : 'var(--md-on-surface)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {bm.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {isLoop && bm.loopRange ? (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: isSelected ? '#fed7aa' : 'var(--md-on-surface-variant)',
                          opacity: 0.9
                        }}>
                          {bm.loopRange.startMeasure && bm.loopRange.endMeasure
                            ? `m. ${bm.loopRange.startMeasure}–${bm.loopRange.endMeasure}`
                            : `Beat ${Math.round(bm.loopRange.startBeat)}–${Math.round(bm.loopRange.endBeat)}`}
                          {bm.bpm ? ` • ${bm.bpm} BPM` : ''}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 10,
                          color: isSelected ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
                          opacity: isSelected ? 0.9 : 0.7
                        }}>
                          Page {bm.page}
                        </span>
                      )}
                      {!isLoop && bm.page === currentPage && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                          style={{
                            background: 'var(--md-primary)',
                            color: 'var(--md-on-primary)',
                          }}
                        >
                          Current
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {isLoop && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(bm);
                      }}
                      className="md-icon-btn"
                      title="Activate Loop & Practice"
                      style={{
                        width: 28,
                        height: 28,
                        color: '#fb923c',
                        background: 'rgba(234, 88, 12, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                      }}
                    >
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => handleCopyLink(bm, e)}
                    className="md-icon-btn"
                    title={copiedId === bm.id ? "Copied!" : "Copy bookmark link"}
                    style={{
                      width: 28,
                      height: 28,
                      color: isSelected ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
                      background: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                    }}
                  >
                    {copiedId === bm.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBookmark(bm.id);
                    }}
                    className="md-icon-btn"
                    title="Delete bookmark"
                    style={{
                      width: 28,
                      height: 28,
                      color: isSelected ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
                      background: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
