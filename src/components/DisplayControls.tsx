import React from 'react';
import type { FilterSettings } from '../services/settingsService';

interface DisplayControlsProps {
  filters: FilterSettings;
  onFiltersChange: (filters: FilterSettings) => void;
}

const BG_PALETTE = [
  { name: 'White',       value: '#ffffff' },
  { name: 'Ivory',       value: '#fffff0' },
  { name: 'Warm Yellow', value: '#faf6eb' },
  { name: 'Sepia Cream', value: '#f4ecd8' },
  { name: 'Soft Black',  value: '#121212' },
  { name: 'Charcoal',   value: '#1e1e24' },
];

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <label className="relative inline-flex items-center cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="sr-only peer"
    />
    <div
      className="w-10 h-6 rounded-full transition-colors peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[18px] after:w-[18px] after:transition-all"
      style={{
        background: checked ? 'var(--md-primary)' : 'var(--md-outline-variant)',
        position: 'relative',
      }}
    />
  </label>
);

export const DisplayControls: React.FC<DisplayControlsProps> = ({
  filters, onFiltersChange
}) => {
  const set = <K extends keyof FilterSettings>(key: K, value: FilterSettings[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderRadius: '8px',
    background: 'var(--md-surface-3)',
    marginBottom: '8px',
  };

  return (
    <div className="flex flex-col h-full" style={{ color: 'var(--md-on-surface)' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 14,
        marginBottom: 16,
        borderBottom: '1px solid var(--md-outline-variant)',
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>Display Filters</h3>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ paddingRight: 2 }}>
        <div>
          {/* Brightness */}
          <div className="slider-container">
            <div className="slider-header">
              <span>Brightness</span><span>{filters.brightness}%</span>
            </div>
            <input type="range" min="50" max="180" value={filters.brightness}
              onChange={e => set('brightness', parseInt(e.target.value))} className="custom-slider" />
          </div>

          {/* Contrast */}
          <div className="slider-container">
            <div className="slider-header">
              <span>Contrast</span><span>{filters.contrast}%</span>
            </div>
            <input type="range" min="50" max="180" value={filters.contrast}
              onChange={e => set('contrast', parseInt(e.target.value))} className="custom-slider" />
          </div>

          {/* Sepia */}
          <div className="slider-container">
            <div className="slider-header">
              <span>Sepia</span><span>{filters.sepia}%</span>
            </div>
            <input type="range" min="0" max="100" value={filters.sepia}
              onChange={e => set('sepia', parseInt(e.target.value))} className="custom-slider" />
          </div>

          {/* Warmth */}
          <div className="slider-container">
            <div className="slider-header">
              <span>Paper Warmth</span><span>{filters.warmth}%</span>
            </div>
            <input type="range" min="0" max="100" value={filters.warmth}
              onChange={e => set('warmth', parseInt(e.target.value))} className="custom-slider" />
          </div>

          {/* Ink Darkness */}
          <div className="slider-container">
            <div className="slider-header">
              <span>Ink Darkness</span><span>{filters.inkDarkness}%</span>
            </div>
            <input type="range" min="0" max="100" value={filters.inkDarkness}
              onChange={e => set('inkDarkness', parseInt(e.target.value))} className="custom-slider" />
          </div>

          {/* Toggles */}
          <div style={{ marginTop: 12 }}>
            <div style={rowStyle}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Night Mode</span>
              <Toggle checked={filters.invert} onChange={v => set('invert', v)} />
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>High Contrast</span>
              <Toggle checked={filters.highContrast} onChange={v => set('highContrast', v)} />
            </div>
          </div>

          {/* Background palette */}
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--md-on-surface-variant)', marginBottom: 10 }}>
              Page Background
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {BG_PALETTE.map(bg => {
                const active = filters.backgroundColor.toLowerCase() === bg.value.toLowerCase();
                return (
                  <button
                    key={bg.name}
                    onClick={() => set('backgroundColor', bg.value)}
                    title={bg.name}
                    style={{
                      width: 32, height: 32,
                      borderRadius: '50%',
                      backgroundColor: bg.value,
                      border: `2px solid ${active ? 'var(--md-primary)' : 'var(--md-outline-variant)'}`,
                      transform: active ? 'scale(1.15)' : 'scale(1)',
                      transition: 'transform 150ms, border-color 150ms',
                      cursor: 'pointer',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default DisplayControls;
