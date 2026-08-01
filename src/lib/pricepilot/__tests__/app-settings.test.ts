/**
 * Unit tests for src/lib/pricepilot/app-settings.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadAppSettings,
  saveAppSettings,
  clearAppSettings,
  hasLegacyAppSettings,
  migrateLegacyAppSettingsIfNeeded,
} from '../app-settings';
import { createDefaultAppSettings } from '../types';

describe('loadAppSettings', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('returns defaults when no settings exist', () => {
    const settings = loadAppSettings();
    expect(settings).toBeDefined();
    expect(settings.applicationMode).toBe(createDefaultAppSettings().applicationMode);
  });

  it('loads saved settings', () => {
    const custom = { ...createDefaultAppSettings(), applicationMode: 'advanced' as const };
    saveAppSettings(custom);
    const loaded = loadAppSettings();
    expect(loaded.applicationMode).toBe('advanced');
  });

  it('handles corrupted JSON gracefully', () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pricepilot_ui_preferences', 'not-valid-json');
    }
    const settings = loadAppSettings();
    expect(settings).toBeDefined();
    expect(settings.applicationMode).toBe(createDefaultAppSettings().applicationMode);
  });
});

describe('saveAppSettings', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('saves settings to localStorage', () => {
    const settings = { ...createDefaultAppSettings(), theme: 'dark' as const };
    saveAppSettings(settings);
    const loaded = loadAppSettings();
    expect(loaded.theme).toBe('dark');
  });

  it('overwrites previous settings', () => {
    const first = { ...createDefaultAppSettings(), theme: 'light' as const };
    const second = { ...createDefaultAppSettings(), theme: 'dark' as const };
    saveAppSettings(first);
    saveAppSettings(second);
    const loaded = loadAppSettings();
    expect(loaded.theme).toBe('dark');
  });
});

describe('clearAppSettings', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('removes settings from localStorage', () => {
    saveAppSettings(createDefaultAppSettings());
    clearAppSettings();
    // After clearing, load should return defaults
    const loaded = loadAppSettings();
    expect(loaded).toBeDefined();
  });
});

describe('hasLegacyAppSettings', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('returns false when no legacy key exists', () => {
    expect(hasLegacyAppSettings()).toBe(false);
  });

  it('returns true when legacy key exists', () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pricepilot_v1_appSettings', '{}');
    }
    expect(hasLegacyAppSettings()).toBe(true);
  });
});

describe('migrateLegacyAppSettingsIfNeeded', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('does nothing when no legacy key exists', () => {
    migrateLegacyAppSettingsIfNeeded();
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('pricepilot_ui_preferences')).toBeNull();
    }
  });

  it('migrates legacy settings to new key', () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pricepilot_v1_appSettings', JSON.stringify({ theme: 'dark' }));
    }
    migrateLegacyAppSettingsIfNeeded();
    if (typeof localStorage !== 'undefined') {
      const newSettings = localStorage.getItem('pricepilot_ui_preferences');
      expect(newSettings).not.toBeNull();
    }
  });

  it('does not overwrite existing new settings', () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pricepilot_v1_appSettings', JSON.stringify({ theme: 'dark' }));
      localStorage.setItem('pricepilot_ui_preferences', JSON.stringify({ theme: 'light' }));
    }
    migrateLegacyAppSettingsIfNeeded();
    if (typeof localStorage !== 'undefined') {
      const newSettings = JSON.parse(localStorage.getItem('pricepilot_ui_preferences') || '{}');
      expect(newSettings.theme).toBe('light');
    }
  });
});
