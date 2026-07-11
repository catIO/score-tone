import React from 'react';
import { Layout, Smartphone, Eye, BookOpen, Layers } from 'lucide-react';
import type { AppSettings } from '../services/settingsService';

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onChange, onClose }) => {
  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onChange({
      ...settings,
      [key]: value
    });
  };

  return (
    <div className="flex flex-col gap-6 animate-fade text-slate-100">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <h3 className="text-xl font-semibold font-display flex items-center gap-2">
          <Layout className="w-5 h-5 text-indigo-400" />
          Viewer Preferences
        </h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
        >
          Close
        </button>
      </div>

      <div className="space-y-6">
        {/* Navigation Mode */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-400" />
            Page Layout Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateSetting('scrollMode', 'single')}
              className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                settings.scrollMode === 'single'
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/25'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              Single Page
            </button>
            <button
              onClick={() => updateSetting('scrollMode', 'continuous')}
              className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                settings.scrollMode === 'continuous'
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/25'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              Vertical Scroll
            </button>
          </div>
        </div>

        {/* Fit Mode */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            Fit Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateSetting('fitMode', 'width')}
              className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                settings.fitMode === 'width'
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/25'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              Fit Width
            </button>
            <button
              onClick={() => updateSetting('fitMode', 'height')}
              className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                settings.fitMode === 'height'
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/25'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              Fit Height
            </button>
          </div>
        </div>

        {/* Two Page Mode */}
        <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              Two-Page Landscape
            </label>
            <p className="text-xs text-slate-400">Shows pages side-by-side in landscape viewports</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.twoPageLandscape}
              onChange={(e) => updateSetting('twoPageLandscape', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:height-5 after:width-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* Controls Auto-hide */}
        <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-400" />
              Auto-Hide Controls
            </label>
            <p className="text-xs text-slate-400">Controls will hide automatically while reading</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoHideControls}
              onChange={(e) => updateSetting('autoHideControls', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:height-5 after:width-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* Tap Zone Width */}
        <div className="space-y-2 bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="flex justify-between">
            <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              Tap Zone Width (Edge %)
            </label>
            <span className="text-sm font-medium text-indigo-400">{settings.tapZoneWidth}%</span>
          </div>
          <p className="text-xs text-slate-400 mb-2">Area of screen left/right reserved for page turns</p>
          <input
            type="range"
            min="10"
            max="40"
            step="5"
            value={settings.tapZoneWidth}
            onChange={(e) => updateSetting('tapZoneWidth', parseInt(e.target.value))}
            className="w-100% h-1 rounded-lg bg-white/10 appearance-none cursor-pointer accent-indigo-600"
          />
        </div>
      </div>
    </div>
  );
};
export default SettingsPanel;
