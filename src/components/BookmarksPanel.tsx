import React, { useState, useEffect } from 'react';
import type { Bookmark, ScoreFile } from '../services/storageService';
import { audioPlaybackService, type LoopRange, type PlaybackState } from '../services/audioPlaybackService';
import { Repeat, Bookmark as BookmarkIcon, Play, Pause, Link, Trash2, Check, MoreVertical, Pencil, RotateCcw } from 'lucide-react';

interface BookmarksPanelProps {
  file: ScoreFile;
  bookmarks: Bookmark[];
  currentPage: number;
  onPageChange: (page: number) => void;
  onAddBookmark: (name: string, page: number) => void;
  onAddLoopBookmark?: (name: string, loopRange: LoopRange, bpm?: number) => void;
  onSelectLoopBookmark?: (bm: Bookmark, autoPlay?: boolean) => void;
  onUpdateBookmark?: (updatedBookmark: Bookmark) => void;
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
  onUpdateBookmark,
  onDeleteBookmark,
  onClose,
  playbackState,
  isMusicXml = false,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'loops' | 'pages'>('all');
  const [newPageBookmarkName, setNewPageBookmarkName] = useState('');
  const [newLoopBookmarkName, setNewLoopBookmarkName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Overflow menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Edit bookmark / loop state
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editStartMeasure, setEditStartMeasure] = useState<number>(1);
  const [editEndMeasure, setEditEndMeasure] = useState<number>(1);
  const [editStartBeat, setEditStartBeat] = useState<number>(0);
  const [editEndBeat, setEditEndBeat] = useState<number>(4);
  const [editBpm, setEditBpm] = useState<number>(80);
  const [editPage, setEditPage] = useState<number>(1);
  const isLoopActive = Boolean(
    isMusicXml &&
    playbackState?.loopRange &&
    (playbackState.loopEnabled || playbackState.loopRange.endMeasure !== undefined)
  );
  const activeLoopRange = isLoopActive ? playbackState?.loopRange : null;

  const defaultLoopName = activeLoopRange
    ? activeLoopRange.startMeasure && activeLoopRange.endMeasure
      ? `m. ${activeLoopRange.startMeasure}–${activeLoopRange.endMeasure}`
      : `Loop Beat ${Math.round(activeLoopRange.startBeat)}–${Math.round(activeLoopRange.endBeat)}`
    : '';

  useEffect(() => {
    if (defaultLoopName) {
      setNewLoopBookmarkName(defaultLoopName);
    }
  }, [defaultLoopName]);

  const handleAddPageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPageBookmarkName.trim() || `Page ${currentPage}`;
    onAddBookmark(name, currentPage);
    setNewPageBookmarkName('');
  };

  const handleAddActiveLoopSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLoopRange || !onAddLoopBookmark) return;
    const name = newLoopBookmarkName.trim() || defaultLoopName || 'Practice Loop';
    onAddLoopBookmark(name, activeLoopRange, playbackState?.bpm);
  };

  const handleQuickAddLoop = () => {
    if (!activeLoopRange || !onAddLoopBookmark) return;
    const name = newLoopBookmarkName.trim() || defaultLoopName || 'Practice Loop';
    onAddLoopBookmark(name, activeLoopRange, playbackState?.bpm);
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
      onSelectLoopBookmark(bm, false);
    } else {
      onPageChange(bm.page);
    }
  };

  const handlePlayClick = (bm: Bookmark, e: React.MouseEvent) => {
    e.stopPropagation();
    if (bm.type === 'loop' && bm.loopRange && onSelectLoopBookmark) {
      onSelectLoopBookmark(bm, true);
    }
  };

  const handleStartEdit = (bm: Bookmark, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setEditingBookmarkId(bm.id);
    setEditName(bm.name);
    setEditBpm(bm.bpm || playbackState?.bpm || 80);
    setEditPage(bm.page || currentPage);

    if (bm.type === 'loop' && bm.loopRange) {
      const sm = bm.loopRange.startMeasure ?? 1;
      const em = bm.loopRange.endMeasure ?? sm;
      setEditStartMeasure(sm);
      setEditEndMeasure(em);
      setEditStartBeat(bm.loopRange.startBeat);
      setEditEndBeat(bm.loopRange.endBeat);
    }
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingBookmarkId(null);
  };

  const handleStartMeasureChange = (newStart: number) => {
    const safeStart = Math.max(1, newStart);
    setEditStartMeasure(safeStart);
    let safeEnd = editEndMeasure;
    if (safeEnd < safeStart) {
      safeEnd = safeStart;
      setEditEndMeasure(safeEnd);
    }
    const range = audioPlaybackService.getBeatRangeForMeasures(safeStart, safeEnd);
    setEditStartBeat(range.startBeat);
    setEditEndBeat(range.endBeat);

    // Auto-update name if matching default m. X-Y pattern or empty
    if (!editName.trim() || /^m\.\s*\d+[–\-]\d+$/i.test(editName.trim())) {
      setEditName(`m. ${safeStart}–${safeEnd}`);
    }
  };

  const handleEndMeasureChange = (newEnd: number) => {
    const safeEnd = Math.max(editStartMeasure, newEnd);
    setEditEndMeasure(safeEnd);
    const range = audioPlaybackService.getBeatRangeForMeasures(editStartMeasure, safeEnd);
    setEditStartBeat(range.startBeat);
    setEditEndBeat(range.endBeat);

    if (!editName.trim() || /^m\.\s*\d+[–\-]\d+$/i.test(editName.trim())) {
      setEditName(`m. ${editStartMeasure}–${safeEnd}`);
    }
  };

  const handleUseActiveSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!playbackState?.loopRange) return;
    const active = playbackState.loopRange;
    if (active.startMeasure !== undefined) {
      setEditStartMeasure(active.startMeasure);
    }
    if (active.endMeasure !== undefined) {
      setEditEndMeasure(active.endMeasure);
    }
    setEditStartBeat(active.startBeat);
    setEditEndBeat(active.endBeat);
    if (playbackState.bpm) {
      setEditBpm(playbackState.bpm);
    }
    if (!editName.trim() || /^m\.\s*\d+[–\-]\d+$/i.test(editName.trim())) {
      if (active.startMeasure !== undefined && active.endMeasure !== undefined) {
        setEditName(`m. ${active.startMeasure}–${active.endMeasure}`);
      }
    }
  };

  const handlePreviewEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    const range: LoopRange = {
      startBeat: editStartBeat,
      endBeat: editEndBeat,
      startMeasure: editStartMeasure,
      endMeasure: editEndMeasure,
    };
    audioPlaybackService.applyLoopRange(range, editBpm);
    audioPlaybackService.play(editBpm).catch(err => {
      console.warn('Preview playback failed:', err);
    });
  };

  const handleSaveEdit = (bm: Bookmark, e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
    if (!onUpdateBookmark) {
      setEditingBookmarkId(null);
      return;
    }

    const isLoop = bm.type === 'loop';
    let updatedBookmark: Bookmark;

    if (isLoop) {
      const defaultName = editStartMeasure && editEndMeasure
        ? `m. ${editStartMeasure}–${editEndMeasure}`
        : `Beat ${Math.round(editStartBeat)}–${Math.round(editEndBeat)}`;

      const updatedRange: LoopRange = {
        ...bm.loopRange,
        startBeat: editStartBeat,
        endBeat: editEndBeat,
        startMeasure: editStartMeasure,
        endMeasure: editEndMeasure,
      };

      updatedBookmark = {
        ...bm,
        name: editName.trim() || defaultName,
        bpm: editBpm,
        loopRange: updatedRange,
      };
    } else {
      updatedBookmark = {
        ...bm,
        name: editName.trim() || `Page ${editPage}`,
        page: editPage,
      };
    }

    onUpdateBookmark(updatedBookmark);
    setEditingBookmarkId(null);
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

      {/* Active Loop Card */}
      {isLoopActive && activeLoopRange && onAddLoopBookmark && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(234, 88, 12, 0.15), rgba(249, 115, 22, 0.05))',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 16,
          border: '1px solid rgba(234, 88, 12, 0.35)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Repeat className="w-3.5 h-3.5 text-orange-400" />
              <p style={{ fontSize: 11, fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                Bookmark Loop
              </p>
            </div>
            <button
              type="button"
              onClick={handleQuickAddLoop}
              className="md-btn-filled"
              style={{
                padding: '4px 10px',
                fontSize: 11,
                borderRadius: 8,
                background: '#ea580c',
                color: '#ffffff',
                fontWeight: 600,
              }}
              title="Bookmark this loop"
            >
              + Add
            </button>
          </div>

          <form onSubmit={handleAddActiveLoopSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              value={newLoopBookmarkName}
              onChange={e => setNewLoopBookmarkName(e.target.value)}
              placeholder={`e.g. ${defaultLoopName || 'Bridge Solo, Tricky Run'}`}
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
          </form>
        </div>
      )}

      {/* Add Page Bookmark card */}
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
            onClick={() => {
              const name = newPageBookmarkName.trim() || `Page ${currentPage}`;
              onAddBookmark(name, currentPage);
              setNewPageBookmarkName('');
            }}
            className="md-btn-filled"
            style={{
              padding: '4px 10px',
              fontSize: 11,
              borderRadius: 8,
              fontWeight: 600,
            }}
            title="Bookmark this page"
          >
            + Add
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
        </form>
      </div>

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
            <BookmarkIcon className="w-8 h-8 mb-2" style={{ color: 'var(--md-on-surface-variant)' }} />
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
            const isEditing = editingBookmarkId === bm.id;
            const isLoopMatching = isLoop &&
              Boolean(playbackState?.loopRange && bm.loopRange &&
              Math.abs(playbackState.loopRange.startBeat - bm.loopRange.startBeat) < 0.05 &&
              Math.abs(playbackState.loopRange.endBeat - bm.loopRange.endBeat) < 0.05);
            const isPageActive = !isLoop && bm.page === currentPage;
            const isSelected = isLoop ? isLoopMatching : isPageActive;

            // If in edit mode, render inline edit card
            if (isEditing) {
              return (
                <div
                  key={bm.id}
                  data-testid={`edit-card-${bm.id}`}
                  style={{
                    background: 'var(--md-surface-2)',
                    border: '1px solid var(--md-loop-border)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Edit Card Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isLoop ? (
                        <Repeat className="w-3.5 h-3.5 text-orange-400" />
                      ) : (
                        <BookmarkIcon className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--md-on-surface)' }}>
                        {isLoop ? 'Edit Loop' : 'Edit Bookmark'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      aria-label="Close edit"
                      className="text-xs text-gray-400 hover:text-gray-200"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: 13, lineHeight: 1 }}
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Name input */}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--md-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                      Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={isLoop ? `m. ${editStartMeasure}–${editEndMeasure}` : `Page ${editPage}`}
                      aria-label="Bookmark name"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        fontSize: 12,
                        borderRadius: 8,
                        border: '1px solid var(--md-outline-variant)',
                        background: 'var(--md-surface-1)',
                        color: 'var(--md-on-surface)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* If loop: In and Out Points */}
                  {isLoop && (
                    <>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {/* IN Point */}
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                            IN (Start m.)
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)', borderRadius: 8, overflow: 'hidden' }}>
                            <button
                              type="button"
                              onClick={() => handleStartMeasureChange(editStartMeasure - 1)}
                              aria-label="Decrease start measure"
                              style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--md-on-surface)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                              title="Decrease start measure"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={editStartMeasure}
                              aria-label="Start measure"
                              onChange={(e) => handleStartMeasureChange(parseInt(e.target.value, 10) || 1)}
                              style={{
                                flex: 1,
                                width: 0,
                                textAlign: 'center',
                                padding: '4px 0',
                                fontSize: 12,
                                fontWeight: 600,
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--md-on-surface)',
                                outline: 'none',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleStartMeasureChange(editStartMeasure + 1)}
                              aria-label="Increase start measure"
                              style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--md-on-surface)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                              title="Increase start measure"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* OUT Point */}
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                            OUT (End m.)
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)', borderRadius: 8, overflow: 'hidden' }}>
                            <button
                              type="button"
                              onClick={() => handleEndMeasureChange(editEndMeasure - 1)}
                              aria-label="Decrease end measure"
                              style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--md-on-surface)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                              title="Decrease end measure"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={editStartMeasure}
                              value={editEndMeasure}
                              aria-label="End measure"
                              onChange={(e) => handleEndMeasureChange(parseInt(e.target.value, 10) || editStartMeasure)}
                              style={{
                                flex: 1,
                                width: 0,
                                textAlign: 'center',
                                padding: '4px 0',
                                fontSize: 12,
                                fontWeight: 600,
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--md-on-surface)',
                                outline: 'none',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleEndMeasureChange(editEndMeasure + 1)}
                              aria-label="Increase end measure"
                              style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--md-on-surface)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                              title="Increase end measure"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Quick capture button if active loop on score */}
                      {isLoopActive && activeLoopRange && (
                        <button
                          type="button"
                          onClick={handleUseActiveSelection}
                          aria-label="Use active selection on score"
                          className="flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-[11px] font-medium transition-colors"
                          style={{
                            background: 'rgba(234, 88, 12, 0.12)',
                            color: '#fb923c',
                            border: '1px dashed rgba(234, 88, 12, 0.35)',
                            cursor: 'pointer',
                          }}
                          title="Update in/out to current selection on score"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Use active selection {activeLoopRange.startMeasure && activeLoopRange.endMeasure ? `(m. ${activeLoopRange.startMeasure}–${activeLoopRange.endMeasure})` : ''}</span>
                        </button>
                      )}

                      {/* BPM */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--md-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Tempo (BPM)
                          </label>
                          {playbackState?.bpm && playbackState.bpm !== editBpm && (
                            <button
                              type="button"
                              onClick={() => setEditBpm(playbackState.bpm)}
                              style={{ fontSize: 10, color: '#fb923c', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              Use score ({playbackState.bpm} BPM)
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => setEditBpm(prev => Math.max(20, prev - 5))}
                            className="px-2 py-1 text-xs font-semibold rounded bg-black/10 dark:bg-white/10 hover:bg-black/20 text-center"
                            style={{ border: 'none', cursor: 'pointer', color: 'var(--md-on-surface)' }}
                          >
                            -5
                          </button>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)', borderRadius: 8, overflow: 'hidden' }}>
                            <button
                              type="button"
                              onClick={() => setEditBpm(prev => Math.max(20, prev - 1))}
                              aria-label="Decrease BPM"
                              style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--md-on-surface)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={20}
                              max={300}
                              value={editBpm}
                              aria-label="BPM"
                              onChange={(e) => setEditBpm(Math.max(20, Math.min(300, parseInt(e.target.value, 10) || 80)))}
                              style={{
                                flex: 1,
                                width: 0,
                                textAlign: 'center',
                                padding: '4px 0',
                                fontSize: 12,
                                fontWeight: 600,
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--md-on-surface)',
                                outline: 'none',
                              }}
                            />
                            <span style={{ fontSize: 10, color: 'var(--md-on-surface-variant)', paddingRight: 4 }}>BPM</span>
                            <button
                              type="button"
                              onClick={() => setEditBpm(prev => Math.min(300, prev + 1))}
                              aria-label="Increase BPM"
                              style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--md-on-surface)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditBpm(prev => Math.min(300, prev + 5))}
                            className="px-2 py-1 text-xs font-semibold rounded bg-black/10 dark:bg-white/10 hover:bg-black/20 text-center"
                            style={{ border: 'none', cursor: 'pointer', color: 'var(--md-on-surface)' }}
                          >
                            +5
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Page if not loop */}
                  {!isLoop && (
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--md-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                        Target Page
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--md-surface-1)', border: '1px solid var(--md-outline-variant)', borderRadius: 8, overflow: 'hidden', width: 120 }}>
                        <button
                          type="button"
                          onClick={() => setEditPage(prev => Math.max(1, prev - 1))}
                          aria-label="Decrease page"
                          style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--md-on-surface)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={editPage}
                          aria-label="Page number"
                          onChange={(e) => setEditPage(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          style={{
                            flex: 1,
                            width: 0,
                            textAlign: 'center',
                            padding: '4px 0',
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--md-on-surface)',
                            outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setEditPage(prev => prev + 1)}
                          aria-label="Increase page"
                          style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--md-on-surface)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    {isLoop ? (
                      <button
                        type="button"
                        onClick={handlePreviewEdit}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                        style={{
                          background: 'rgba(234, 88, 12, 0.15)',
                          color: '#fb923c',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        title="Preview loop on score"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Preview</span>
                      </button>
                    ) : <div />}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        style={{
                          padding: '5px 10px',
                          fontSize: 12,
                          fontWeight: 600,
                          background: 'transparent',
                          color: 'var(--md-on-surface-variant)',
                          border: 'none',
                          cursor: 'pointer',
                          borderRadius: 6,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleSaveEdit(bm, e)}
                        style={{
                          padding: '5px 14px',
                          fontSize: 12,
                          fontWeight: 600,
                          background: '#ea580c',
                          color: '#ffffff',
                          border: 'none',
                          cursor: 'pointer',
                          borderRadius: 6,
                          boxShadow: '0 2px 8px rgba(234, 88, 12, 0.4)',
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

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
                    ? (isLoop ? 'var(--md-loop-bg)' : 'var(--md-primary-container)')
                    : 'var(--md-surface-3)',
                  border: isSelected
                    ? (isLoop ? '1px solid var(--md-loop-border)' : '1px solid var(--md-primary)')
                    : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
                className="group hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: 1, marginRight: 6 }}>
                  {isLoop ? (
                    <div style={{
                      marginTop: 2,
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: 'var(--md-loop-bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Repeat className="w-3.5 h-3.5" style={{ color: 'var(--md-loop-text)' }} />
                    </div>
                  ) : (
                    <div style={{
                      marginTop: 2,
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: 'rgba(158, 78, 0, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <BookmarkIcon className="w-3.5 h-3.5" style={{ color: 'var(--md-primary)' }} />
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isSelected
                        ? (isLoop ? 'var(--md-loop-text)' : 'var(--md-on-primary-container)')
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
                          color: isSelected ? 'var(--md-loop-text)' : 'var(--md-on-surface-variant)',
                          opacity: 0.95
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
                          opacity: isSelected ? 0.95 : 0.85
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
                  {isLoop && (
                    <button
                      onClick={(e) => handlePlayClick(bm, e)}
                      className="md-icon-btn"
                      title={isLoopMatching && playbackState?.isPlaying ? "Pause loop" : "Play loop"}
                      aria-label={isLoopMatching && playbackState?.isPlaying ? "Pause loop" : "Play loop"}
                      style={{
                        width: 28,
                        height: 28,
                        color: '#fb923c',
                        background: isLoopMatching && playbackState?.isPlaying
                          ? 'rgba(234, 88, 12, 0.35)'
                          : 'rgba(234, 88, 12, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        transition: 'all 150ms ease',
                      }}
                    >
                      {isLoopMatching && playbackState?.isPlaying ? (
                        <Pause className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      )}
                    </button>
                  )}

                  <button
                    onClick={(e) => handleStartEdit(bm, e)}
                    className="md-icon-btn"
                    title={isLoop ? "Edit loop" : "Edit bookmark"}
                    aria-label={isLoop ? "Edit loop" : "Edit bookmark"}
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
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === bm.id ? null : bm.id);
                    }}
                    className="md-icon-btn"
                    title="More options"
                    aria-label="More options"
                    aria-haspopup="true"
                    aria-expanded={openMenuId === bm.id}
                    style={{
                      width: 28,
                      height: 28,
                      color: isSelected ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
                      background: openMenuId === bm.id ? 'var(--md-surface-4)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                    }}
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {/* Overflow Menu Dropdown */}
                  {openMenuId === bm.id && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(null);
                        }}
                      />
                      <div
                        role="menu"
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 'calc(100% + 4px)',
                          zIndex: 50,
                          background: 'var(--md-surface-3)',
                          border: '1px solid var(--md-outline-variant)',
                          borderRadius: 8,
                          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                          padding: '4px',
                          minWidth: 130,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          role="menuitem"
                          onClick={(e) => handleStartEdit(bm, e)}
                          className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded hover:bg-black/10 dark:hover:bg-white/10 text-left w-full transition-colors"
                          style={{ color: 'var(--md-on-surface)', border: 'none', background: 'transparent', cursor: 'pointer' }}
                        >
                          <Pencil className="w-3.5 h-3.5 text-orange-400" />
                          <span>Edit</span>
                        </button>
                        <button
                          role="menuitem"
                          onClick={(e) => {
                            handleCopyLink(bm, e);
                            setTimeout(() => setOpenMenuId(null), 800);
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded hover:bg-black/10 dark:hover:bg-white/10 text-left w-full transition-colors"
                          style={{ color: 'var(--md-on-surface)', border: 'none', background: 'transparent', cursor: 'pointer' }}
                        >
                          {copiedId === bm.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-medium">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Link className="w-3.5 h-3.5" />
                              <span>Share link</span>
                            </>
                          )}
                        </button>
                        <div style={{ height: 1, background: 'var(--md-outline-variant)', margin: '2px 0' }} />
                        <button
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                            onDeleteBookmark(bm.id);
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded hover:bg-rose-500/15 text-left w-full transition-colors"
                          style={{ color: '#f87171', border: 'none', background: 'transparent', cursor: 'pointer' }}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </>
                  )}
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
