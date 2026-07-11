export interface FilterSettings {
  sepia: number; // 0 - 100
  brightness: number; // 50 - 200
  contrast: number; // 50 - 200
  warmth: number; // 0 - 100 (tint opacity)
  invert: boolean;
  highContrast: boolean;
  backgroundColor: string; // hex color or preset name
  inkDarkness: number; // 0 - 100 (filter adjustment)
}

export interface AppSettings {
  lastPreset: string;
  customSliders: FilterSettings;
  fitMode: 'width' | 'height';
  scrollMode: 'single' | 'continuous';
  tapZoneWidth: number; // percentage (e.g., 20)
  autoHideControls: boolean;
  twoPageLandscape: boolean;
}

const DEFAULT_FILTERS: FilterSettings = {
  sepia: 0,
  brightness: 100,
  contrast: 100,
  warmth: 0,
  invert: false,
  highContrast: false,
  backgroundColor: '#ffffff',
  inkDarkness: 0
};

const DEFAULT_SETTINGS: AppSettings = {
  lastPreset: 'Original',
  customSliders: DEFAULT_FILTERS,
  fitMode: 'width',
  scrollMode: 'single',
  tapZoneWidth: 20,
  autoHideControls: true,
  twoPageLandscape: true
};

const STORAGE_KEY = 'scoretone_settings';

export const settingsService = {
  getSettings(): AppSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(data);
      // Merge with defaults to handle new keys in future releases
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        customSliders: {
          ...DEFAULT_FILTERS,
          ...parsed.customSliders
        }
      };
    } catch (e) {
      console.error('Failed to load settings', e);
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  },

  // Hardcoded presets definition
  getBuiltInPresets(): Record<string, FilterSettings> {
    return {
      'Original': {
        ...DEFAULT_FILTERS
      },
      'Sepia': {
        ...DEFAULT_FILTERS,
        sepia: 80,
        brightness: 95,
        contrast: 95,
        backgroundColor: '#f4ecd8'
      },
      'Warm Paper': {
        ...DEFAULT_FILTERS,
        warmth: 35,
        sepia: 20,
        brightness: 98,
        backgroundColor: '#faf6eb'
      },
      'Ivory': {
        ...DEFAULT_FILTERS,
        warmth: 15,
        brightness: 100,
        backgroundColor: '#fffff0'
      },
      'Night Mode': {
        ...DEFAULT_FILTERS,
        invert: true,
        brightness: 90,
        contrast: 100,
        backgroundColor: '#121212'
      },
      'High Contrast': {
        ...DEFAULT_FILTERS,
        contrast: 150,
        brightness: 100,
        highContrast: true,
        backgroundColor: '#ffffff'
      },
      'Stage Dim': {
        ...DEFAULT_FILTERS,
        brightness: 60,
        contrast: 90,
        backgroundColor: '#e5e5e5'
      }
    };
  }
};
