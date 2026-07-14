import React from 'react';
import type { AppSettings } from '../services/settingsService';

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
  wakeLockActive: boolean;
  wakeLockSupported: boolean;
}

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" disabled={disabled} />
    <div
      className="peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[18px] after:w-[18px] after:transition-all"
      style={{
        width: 40, height: 24,
        borderRadius: 12,
        background: checked ? 'var(--md-primary)' : 'var(--md-outline-variant)',
        position: 'relative',
        transition: 'background 150ms',
      }}
    />
  </label>
);

const SegmentedControl: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ options, value, onChange }) => (
  <div style={{
    display: 'flex',
    background: 'var(--md-surface-3)',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  }}>
    {options.map(opt => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        style={{
          flex: 1,
          padding: '7px 12px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          background: value === opt.value ? 'var(--md-primary-container)' : 'transparent',
          color: value === opt.value ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
          transition: 'background 150ms, color 150ms',
        }}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const Row: React.FC<{ label: string; description?: string; children: React.ReactNode }> = ({ label, description, children }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderRadius: 8,
    background: 'var(--md-surface-3)',
    marginBottom: 8,
    gap: 16,
  }}>
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--md-on-surface)', marginBottom: description ? 2 : 0 }}>{label}</p>
      {description && <p style={{ fontSize: 11, color: 'var(--md-on-surface-variant)' }}>{description}</p>}
    </div>
    {children}
  </div>
);

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onChange, onClose, wakeLockActive, wakeLockSupported }) => {
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    onChange({ ...settings, [key]: value });

  // Derive wake lock status label and color
  const wakeLockStatus = !wakeLockSupported
    ? { label: 'Unsupported', color: 'var(--md-on-surface-variant)' }
    : wakeLockActive
      ? { label: 'Active', color: '#81C784' }
      : { label: settings.keepScreenAwake ? 'Acquiring…' : 'Off', color: 'var(--md-on-surface-variant)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, color: 'var(--md-on-surface)' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 14,
        marginBottom: 16,
        borderBottom: '1px solid var(--md-outline-variant)',
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>Viewer Preferences</h3>
        <button onClick={onClose} className="md-btn-text" style={{ padding: '4px 10px', fontSize: 12 }}>Close</button>
      </div>

      {/* Page Layout */}
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--md-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Page Layout
      </p>
      <div style={{ marginBottom: 16 }}>
        <SegmentedControl
          options={[{ value: 'single', label: 'Single' }, { value: 'continuous', label: 'Scroll' }]}
          value={settings.scrollMode}
          onChange={v => set('scrollMode', v as AppSettings['scrollMode'])}
        />
      </div>

      {/* Fit Mode */}
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--md-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Fit Mode
      </p>
      <div style={{ marginBottom: 16 }}>
        <SegmentedControl
          options={[{ value: 'width', label: 'Fit Width' }, { value: 'height', label: 'Fit Height' }]}
          value={settings.fitMode}
          onChange={v => set('fitMode', v as AppSettings['fitMode'])}
        />
      </div>

      {/* Toggles */}
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--md-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Options
      </p>
      <Row label="Two-Page Landscape" description="Side-by-side pages in landscape">
        <Toggle checked={settings.twoPageLandscape} onChange={v => set('twoPageLandscape', v)} />
      </Row>

      {/* Tap Zone */}
      <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--md-surface-3)', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--md-on-surface)' }}>Tap Zone Width</p>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--md-primary)' }}>{settings.tapZoneWidth}%</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--md-on-surface-variant)', marginBottom: 10 }}>
          Edge area reserved for page turns
        </p>
        <input
          type="range" min="10" max="40" step="5"
          value={settings.tapZoneWidth}
          onChange={e => set('tapZoneWidth', parseInt(e.target.value))}
          className="custom-slider"
          style={{ width: '100%' }}
        />
      </div>

      {/* Performance */}
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--md-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, marginTop: 8 }}>
        Performance
      </p>
      <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--md-surface-3)', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--md-on-surface)', marginBottom: 2 }}>Keep Screen Awake</p>
            <p style={{ fontSize: 11, color: 'var(--md-on-surface-variant)' }}>
              Prevent screen timeout while reading a score
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <Toggle
              checked={settings.keepScreenAwake}
              onChange={v => set('keepScreenAwake', v)}
              disabled={!wakeLockSupported}
            />
            <span style={{ fontSize: 10, fontWeight: 600, color: wakeLockStatus.color, letterSpacing: '0.04em' }}>
              {wakeLockStatus.label}
            </span>
          </div>
        </div>
        {!wakeLockSupported && (
          <p style={{ fontSize: 11, color: 'var(--md-on-surface-variant)', marginTop: 8 }}>
            Screen Wake Lock is not supported in this browser. Use Safari 16.4+ on iPad or Chrome on desktop.
          </p>
        )}
      </div>
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--md-outline-variant)', textAlign: 'center', fontSize: 11 }}>
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--md-primary)', textDecoration: 'underline' }}>
          Privacy Policy
        </a>
      </div>
    </div>
  );
};
export default SettingsPanel;
