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
  theme: 'dark' | 'light';
  lastPreset: string;
  customSliders: FilterSettings;
  fitMode: 'width' | 'height';
  scrollMode: 'single' | 'continuous';
  tapZoneWidth: number; // percentage (e.g., 20)
  autoHideControls: boolean;
  twoPageLandscape: boolean;
  /** Acquire a Screen Wake Lock while a score is open (prevents screen timeout) */
  keepScreenAwake: boolean;
  /** Show right-hand guitar fingering (p, i, m, a) in MusicXML scores */
  showRightHandFingering: boolean;
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

const SEPIA_FILTERS: FilterSettings = {
  sepia: 80,
  brightness: 90,
  contrast: 114,
  warmth: 100,
  invert: false,
  highContrast: false,
  backgroundColor: '#ffffff',
  inkDarkness: 0
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  lastPreset: 'Sepia',
  customSliders: SEPIA_FILTERS,
  fitMode: 'height',
  scrollMode: 'single',
  tapZoneWidth: 20,
  autoHideControls: true,
  twoPageLandscape: true,
  keepScreenAwake: true,
  showRightHandFingering: true
};

const STORAGE_KEY = 'scoretone_settings';
const THEME_STORAGE_KEY = 'scoretone_theme';

export const settingsService = {
  getSettings(): AppSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      const savedTheme = (localStorage.getItem(THEME_STORAGE_KEY) as 'dark' | 'light') || undefined;
      if (!data) {
        return {
          ...DEFAULT_SETTINGS,
          ...(savedTheme ? { theme: savedTheme } : {})
        };
      }
      const parsed = JSON.parse(data);
      // Migrate legacy dark surround background colors (#1e1e24, #121212) to white paper
      if (
        parsed.customSliders &&
        (parsed.customSliders.backgroundColor === '#1e1e24' || parsed.customSliders.backgroundColor === '#121212')
      ) {
        parsed.customSliders.backgroundColor = '#ffffff';
      }
      // Merge with defaults to handle new keys in future releases
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        theme: savedTheme || parsed.theme || 'dark',
        customSliders: {
          ...SEPIA_FILTERS,
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
      if (settings.theme) {
        localStorage.setItem(THEME_STORAGE_KEY, settings.theme);
      }
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  },

  getTheme(): 'dark' | 'light' {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  },

  setTheme(theme: 'dark' | 'light'): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      const current = this.getSettings();
      this.saveSettings({ ...current, theme });
    } catch (e) {
      console.error('Failed to set theme', e);
    }
  },

  // Hardcoded presets definition
  getBuiltInPresets(): Record<string, FilterSettings> {
    return {
      'Original': {
        ...DEFAULT_FILTERS
      },
      'Sepia': {
        ...SEPIA_FILTERS
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

/**
 * Maps FilterSettings to a standard CSS filter string
 */
export function buildCssFilterString(filters?: FilterSettings): string {
  if (!filters) return 'none';
  let str = `sepia(${filters.sepia}%) brightness(${filters.brightness}%) contrast(${filters.contrast}%)`;
  if (filters.invert) {
    str += ' invert(100%)';
  }
  if (filters.highContrast) {
    str += ' contrast(150%) saturate(80%)';
  }
  if (filters.inkDarkness > 0) {
    str += ' url(#scoretone-ink-darkness)';
  }
  return str;
}

/**
 * Builds warmth tint overlay style for score paper pages
 */
export function buildTintStyle(filters?: FilterSettings): Record<string, string | number> | null {
  if (!filters || filters.invert || (filters.warmth <= 0 && filters.sepia <= 0)) return null;
  const opacity = Math.max(filters.warmth, filters.sepia) / 250;
  return {
    backgroundColor: '#ff9c3a',
    opacity,
    mixBlendMode: 'multiply',
    pointerEvents: 'none',
    position: 'absolute',
    zIndex: 5,
  };
}

/**
 * Resolves the effective background color for sheet music paper.
 * If inverted (Night Mode) or if a dark viewer color (#1e1e24, #121212) is set,
 * returns '#ffffff' so ink remains legible and invert filters work properly.
 */
export function getScorePageBackgroundColor(filters?: FilterSettings): string {
  if (!filters) return '#ffffff';
  if (filters.invert) return '#ffffff';
  const bg = filters.backgroundColor?.toLowerCase();
  if (!bg || bg === '#1e1e24' || bg === '#121212' || bg === '#ffffff') {
    return '#ffffff';
  }
  return filters.backgroundColor;
}
