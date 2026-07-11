import React, { useState, useEffect } from 'react';
import { Bookmark, Plus, Trash2 } from 'lucide-react';
import { settingsService, type FilterSettings } from '../services/settingsService';
import { storageService, type CustomPreset } from '../services/storageService';

interface PresetSelectorProps {
  currentPresetName: string;
  currentFilters: FilterSettings;
  onPresetSelect: (name: string, filters: FilterSettings) => void;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  currentPresetName,
  currentFilters,
  onPresetSelect
}) => {
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  const builtInPresets = settingsService.getBuiltInPresets();

  useEffect(() => {
    loadCustomPresets();
  }, []);

  const loadCustomPresets = async () => {
    try {
      const presets = await storageService.getPresets();
      setCustomPresets(presets);
    } catch (e) {
      console.error('Failed to load custom presets', e);
    }
  };

  const handleSaveCustomPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    const id = `custom-${Date.now()}`;
    const presetToSave: CustomPreset = {
      id,
      name: newPresetName.trim(),
      ...currentFilters
    };

    try {
      await storageService.savePreset(presetToSave);
      setNewPresetName('');
      setShowSaveForm(false);
      await loadCustomPresets();
      // Apply saved preset
      onPresetSelect(presetToSave.name, currentFilters);
    } catch (e) {
      console.error('Failed to save preset', e);
    }
  };

  const handleDeleteCustomPreset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await storageService.deletePreset(id);
      await loadCustomPresets();
    } catch (e) {
      console.error('Failed to delete custom preset', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Built-in Presets */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Default Presets
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(builtInPresets).map(([name, filters]) => {
            const isSelected = currentPresetName === name;
            return (
              <button
                key={name}
                onClick={() => onPresetSelect(name, filters)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-500 text-white font-medium shadow-md shadow-indigo-600/15'
                    : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10 hover:border-white/10'
                }`}
              >
                <span>{name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Presets */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Custom Presets
          </h4>
          {!showSaveForm && (
            <button
              onClick={() => setShowSaveForm(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Save Current
            </button>
          )}
        </div>

        {showSaveForm && (
          <form onSubmit={handleSaveCustomPreset} className="bg-white/5 p-3 rounded-lg border border-white/5 mb-3 flex flex-col gap-2">
            <div className="text-xs text-slate-400">Name current filter values:</div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="My Preset"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                maxLength={20}
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-white/10 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowSaveForm(false)}
                className="px-2 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {customPresets.length === 0 ? (
          <div className="text-xs text-slate-500 italic py-2">
            No custom presets saved. Adjust sliders and click "Save Current" to create one.
          </div>
        ) : (
          <div className="space-y-2">
            {customPresets.map((preset) => {
              const isSelected = currentPresetName === preset.name;
              const presetFilters: FilterSettings = {
                sepia: preset.sepia,
                brightness: preset.brightness,
                contrast: preset.contrast,
                warmth: preset.warmth,
                invert: preset.invert,
                highContrast: preset.highContrast,
                backgroundColor: preset.backgroundColor,
                inkDarkness: preset.inkDarkness
              };
              return (
                <div
                  key={preset.id}
                  onClick={() => onPresetSelect(preset.name, presetFilters)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-500 text-white font-medium'
                      : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-indigo-400 fill-indigo-400/20" />
                    {preset.name}
                  </span>
                  <button
                    onClick={(e) => handleDeleteCustomPreset(preset.id, e)}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-rose-400 transition-colors"
                    title="Delete Preset"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
export default PresetSelector;
