import React from 'react';
import type { CurrentTool } from '../hooks/useAnnotationState';
import { ANNOTATION_PALETTE, PEN_SIZES, HIGHLIGHTER_SIZES } from '../hooks/useAnnotationState';

interface AnnotationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTool: CurrentTool;
  onSelectTool: (tool: CurrentTool) => void;
  activeSizeIndex: number;
  onSelectSizeIndex: (index: number) => void;
  activeColor: string;
  onSelectColor: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearPage: () => void;
  canUndo: boolean;
  canRedo: boolean;
  currentPage: number;
}

export const AnnotationDrawer: React.FC<AnnotationDrawerProps> = ({
  isOpen,
  onClose,
  activeTool,
  onSelectTool,
  activeSizeIndex,
  onSelectSizeIndex,
  activeColor,
  onSelectColor,
  onUndo,
  onRedo,
  onClearPage,
  canUndo,
  canRedo,
  currentPage,
}) => {
  return (
    <div
      className="sidebar-control-panel absolute right-0 bottom-0 select-none overflow-y-auto flex flex-col z-60"
      style={{
        top: 64,
        width: 290,
        background: 'var(--md-surface-1)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderLeft: '1px solid var(--md-outline-variant)',
        boxShadow: 'var(--md-card-shadow-hover)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 250ms cubic-bezier(0.2, 0, 0, 1)',
        color: 'var(--md-on-surface)',
      }}
    >
      {/* Header with Title and Close Button */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--md-outline-variant)' }}>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-blue-400">edit_note</span>
          <span className="font-semibold text-sm tracking-wide">Annotate P. {currentPage}</span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-95 transition-colors"
          title="Close annotations panel"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div className="p-4 space-y-6 flex-1 overflow-y-auto">
        {/* Tool Selectors: Highlighter, Pen, Eraser */}
        <div className="flex items-center justify-center gap-3">
          {/* Highlighter */}
          <button
            onClick={() => onSelectTool('highlighter')}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              activeTool === 'highlighter'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-105 ring-2 ring-blue-400/40'
                : 'bg-black/10 dark:bg-white/5 hover:bg-black/20 dark:hover:bg-white/10 text-[var(--md-on-surface-variant)]'
            }`}
            title="Highlighter"
          >
            <span className="material-symbols-outlined text-[24px]">ink_highlighter</span>
          </button>

          {/* Pen */}
          <button
            onClick={() => onSelectTool('pen')}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              activeTool === 'pen'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-105 ring-2 ring-blue-400/40'
                : 'bg-black/10 dark:bg-white/5 hover:bg-black/20 dark:hover:bg-white/10 text-[var(--md-on-surface-variant)]'
            }`}
            title="Pen"
          >
            <span className="material-symbols-outlined text-[24px]">edit</span>
          </button>

          {/* Eraser */}
          <button
            onClick={() => onSelectTool('eraser')}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              activeTool === 'eraser'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-105 ring-2 ring-blue-400/40'
                : 'bg-black/10 dark:bg-white/5 hover:bg-black/20 dark:hover:bg-white/10 text-[var(--md-on-surface-variant)]'
            }`}
            title="Stroke Eraser (Touch line to erase)"
          >
            <span className="material-symbols-outlined text-[24px]">ink_eraser</span>
          </button>
        </div>

        {/* Size Selection (5 stroke presets) */}
        {activeTool !== 'eraser' && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 opacity-80">
              Size
            </label>
            <div className="grid grid-cols-5 gap-2 items-center justify-items-center p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--md-outline-variant)]">
              {PEN_SIZES.map((penSize, idx) => {
                const isSelected = activeSizeIndex === idx;
                const strokeThickness = Math.max(1.5, idx * 1.5 + 1.5);
                const displaySize = activeTool === 'highlighter' ? HIGHLIGHTER_SIZES[idx] : penSize;

                return (
                  <button
                    key={idx}
                    onClick={() => onSelectSizeIndex(idx)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md scale-105'
                        : 'hover:bg-white/10 text-[var(--md-on-surface)]'
                    }`}
                    title={`Size ${displaySize}px`}
                  >
                    {/* Visual diagonal line indicator with thickness */}
                    <div
                      style={{
                        width: 20,
                        height: strokeThickness,
                        backgroundColor: isSelected ? '#ffffff' : 'currentColor',
                        borderRadius: 2,
                        transform: 'rotate(-45deg)',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Color Palette Grid (20 swatches: 4 rows x 5 columns) */}
        {activeTool !== 'eraser' && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 opacity-80">
              Color
            </label>
            <div className="grid grid-cols-5 gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--md-outline-variant)]">
              {ANNOTATION_PALETTE.map((color) => {
                const isSelected = activeColor.toLowerCase() === color.toLowerCase();
                const isLight = color === '#FFFFFF' || color === '#E5E7EB';

                return (
                  <button
                    key={color}
                    onClick={() => onSelectColor(color)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                      isSelected ? 'ring-2 ring-blue-500 ring-offset-2 scale-110 shadow-md' : 'hover:scale-105'
                    }`}
                    style={{
                      backgroundColor: color,
                      border: isLight ? '1px solid rgba(0,0,0,0.2)' : '1px solid rgba(255,255,255,0.15)',
                    }}
                    title={color}
                  >
                    {isSelected && (
                      <span
                        className="material-symbols-outlined text-[16px] leading-none"
                        style={{ color: isLight ? '#111827' : '#ffffff' }}
                      >
                        check
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Undo / Redo / Clear Actions */}
        <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--md-outline-variant)' }}>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">undo</span>
              <span>Undo</span>
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">redo</span>
              <span>Redo</span>
            </button>
          </div>

          <button
            onClick={onClearPage}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/25 transition-colors border border-rose-500/20"
          >
            <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
            <span>Clear Page Annotations</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnnotationDrawer;
