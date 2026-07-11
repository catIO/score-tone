import React, { useState } from 'react';
import { Sliders, Sun, Contrast, Coffee, Paintbrush, Moon, Activity, EyeOff } from 'lucide-react';
import type { FilterSettings } from '../services/settingsService';
import PresetSelector from './PresetSelector';

interface DisplayControlsProps {
  filters: FilterSettings;
  presetName: string;
  onFiltersChange: (filters: FilterSettings) => void;
  onPresetSelect: (name: string, filters: FilterSettings) => void;
}

const BG_PALETTE = [
  { name: 'White', value: '#ffffff' },
  { name: 'Ivory', value: '#fffff0' },
  { name: 'Warm Yellow', value: '#faf6eb' },
  { name: 'Sepia Cream', value: '#f4ecd8' },
  { name: 'Soft Black', value: '#121212' },
  { name: 'Charcoal', value: '#1e1e24' }
];

export const DisplayControls: React.FC<DisplayControlsProps> = ({
  filters,
  presetName,
  onFiltersChange,
  onPresetSelect
}) => {
  const [activeTab, setActiveTab] = useState<'sliders' | 'presets'>('sliders');

  const handleSliderChange = <K extends keyof FilterSettings>(key: K, value: FilterSettings[K]) => {
    // If the user modifies any slider, set the active preset name to "Custom"
    const newFilters = { ...filters, [key]: value };
    onFiltersChange(newFilters);
  };

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-5">
        <button
          onClick={() => setActiveTab('sliders')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-all flex items-center justify-center gap-2 ${
            activeTab === 'sliders'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Sliders
        </button>
        <button
          onClick={() => setActiveTab('presets')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-all flex items-center justify-center gap-2 ${
            activeTab === 'presets'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          Presets ({presetName})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {activeTab === 'sliders' ? (
          <div className="space-y-5 pb-4">
            {/* Brightness */}
            <div className="slider-container">
              <div className="slider-header">
                <span className="flex items-center gap-2"><Sun className="w-4 h-4 text-amber-400" /> Brightness</span>
                <span>{filters.brightness}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="180"
                value={filters.brightness}
                onChange={(e) => handleSliderChange('brightness', parseInt(e.target.value))}
                className="custom-slider"
              />
            </div>

            {/* Contrast */}
            <div className="slider-container">
              <div className="slider-header">
                <span className="flex items-center gap-2"><Contrast className="w-4 h-4 text-emerald-400" /> Contrast</span>
                <span>{filters.contrast}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="180"
                value={filters.contrast}
                onChange={(e) => handleSliderChange('contrast', parseInt(e.target.value))}
                className="custom-slider"
              />
            </div>

            {/* Sepia */}
            <div className="slider-container">
              <div className="slider-header">
                <span className="flex items-center gap-2"><Coffee className="w-4 h-4 text-orange-400" /> Sepia Intensity</span>
                <span>{filters.sepia}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={filters.sepia}
                onChange={(e) => handleSliderChange('sepia', parseInt(e.target.value))}
                className="custom-slider"
              />
            </div>

            {/* Warmth (Overlay intensity) */}
            <div className="slider-container">
              <div className="slider-header">
                <span className="flex items-center gap-2"><Paintbrush className="w-4 h-4 text-rose-400" /> Paper Warmth</span>
                <span>{filters.warmth}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={filters.warmth}
                onChange={(e) => handleSliderChange('warmth', parseInt(e.target.value))}
                className="custom-slider"
              />
            </div>

            {/* Ink Darkness (SVG filter slope) */}
            <div className="slider-container">
              <div className="slider-header">
                <span className="flex items-center gap-2"><EyeOff className="w-4 h-4 text-indigo-400" /> Ink Darkness</span>
                <span>{filters.inkDarkness}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={filters.inkDarkness}
                onChange={(e) => handleSliderChange('inkDarkness', parseInt(e.target.value))}
                className="custom-slider"
              />
            </div>

            {/* Night mode & High contrast Toggles */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between bg-white/5 p-3.5 rounded-xl border border-white/5">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Moon className="w-4 h-4 text-indigo-400" /> Invert / Night Mode
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.invert}
                    onChange={(e) => handleSliderChange('invert', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:height-5 after:width-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between bg-white/5 p-3.5 rounded-xl border border-white/5">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Activity className="w-4 h-4 text-cyan-400" /> High Contrast
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.highContrast}
                    onChange={(e) => handleSliderChange('highContrast', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:height-5 after:width-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>

            {/* Background color selection */}
            <div className="space-y-2 pt-2">
              <label className="text-sm font-semibold text-slate-300">Page Background Color</label>
              <div className="flex flex-wrap gap-2">
                {BG_PALETTE.map((bg) => {
                  const isSelected = filters.backgroundColor.toLowerCase() === bg.value.toLowerCase();
                  return (
                    <button
                      key={bg.name}
                      onClick={() => handleSliderChange('backgroundColor', bg.value)}
                      className={`w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center ${
                        isSelected ? 'border-indigo-500 scale-110 shadow-md shadow-indigo-500/30' : 'border-white/20'
                      }`}
                      style={{ backgroundColor: bg.value }}
                      title={bg.name}
                    >
                      {isSelected && (
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: bg.value === '#ffffff' || bg.value === '#fffff0' || bg.value === '#faf6eb' || bg.value === '#f4ecd8' ? '#121212' : '#ffffff' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <PresetSelector
            currentPresetName={presetName}
            currentFilters={filters}
            onPresetSelect={onPresetSelect}
          />
        )}
      </div>
    </div>
  );
};
export default DisplayControls;
