import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderBar } from './HeaderBar';
import { googleDriveService, type GoogleUserProfile } from '../services/googleDriveService';
import type { AppSettings } from '../services/settingsService';

vi.mock('../services/googleDriveService', () => ({
  GOOGLE_ACCOUNT_CHANGED_EVENT: 'scoretone:google-account-changed',
  GOOGLE_CONNECTION_CHANGED_EVENT: 'scoretone:google-connection-changed',
  googleDriveService: { getUserProfile: vi.fn(), getAccessToken: vi.fn() },
}));

type Props = ComponentProps<typeof HeaderBar>;
const profile: GoogleUserProfile = { sub: 'account-a', name: 'Ada Music', email: 'ada@example.test' };
const settings: AppSettings = {
  theme: 'dark', lastPreset: 'Custom',
  customSliders: { sepia: 35, brightness: 85, contrast: 125, warmth: 20, invert: true, highContrast: true, backgroundColor: '#fffabc', inkDarkness: 45 },
  fitMode: 'height', scrollMode: 'single', tapZoneWidth: 20,
  autoHideControls: true, twoPageLandscape: true, keepScreenAwake: true, showRightHandFingering: true,
};

function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    theme: 'dark', settings, onSettingsChange: vi.fn(), onToggleTheme: vi.fn(),
    onAddScore: vi.fn(), onOpenDrive: vi.fn(), onOpenGuide: vi.fn(), onOpenAbout: vi.fn(),
    isGoogleConfigured: true, isOnline: true, driveToken: null,
    onDriveLogout: vi.fn(), onChooseAccount: vi.fn(),
    stats: { totalScores: 9, pdfCount: 6, xmlCount: 3, driveCount: 5, offlineCount: 4 },
    ...overrides,
  };
  return { ...render(<HeaderBar {...props} />), props };
}

function openSettings(entry: 'Settings' | 'Account & cloud') {
  fireEvent.click(screen.getByRole('button', { name: 'Account and settings' }));
  fireEvent.click(screen.getByRole('button', { name: entry }));
  return screen.getByRole('dialog', { name: 'Settings' });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(googleDriveService.getUserProfile).mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  expect(googleDriveService.getAccessToken).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('HeaderBar settings entry points', () => {
  it.each([
    ['Settings', 'General'],
    ['Account & cloud', 'Account & cloud'],
  ] as const)('opens %s directly on the %s tab and restores focus on Escape', (entry, tab) => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Account and settings' });
    const dialog = openSettings(entry);
    const selectedTab = within(dialog).getByRole('tab', { name: tab, selected: true });
    expect(document.activeElement).toBe(selectedTab);
    expect(within(dialog).getByRole('tabpanel', { name: tab })).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('aria-controls')).toBe(false);
    fireEvent.keyDown(selectedTab, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it.each([
    { name: 'disconnected', remembered: false, token: null, online: true, status: 'No account connected · Device library' },
    { name: 'remembered', remembered: true, token: null, online: true, status: 'Account remembered · Drive reconnect required' },
    { name: 'active', remembered: true, token: 'cached-token', online: true, status: 'Google Drive connected' },
    { name: 'offline', remembered: true, token: 'cached-token', online: false, status: 'Offline · Account remembered' },
  ])('keeps $name status truthful without duplicate cloud authentication in the menu', ({ remembered, token, online, status }) => {
    vi.mocked(googleDriveService.getUserProfile).mockReturnValue(remembered ? profile : null);
    mount({ driveToken: token, isOnline: online });
    const trigger = screen.getByRole('button', { name: 'Account and settings' });
    fireEvent.click(trigger);
    const menu = within(document.getElementById(trigger.getAttribute('aria-controls')!)!);
    expect(menu.getByRole('status').textContent).toBe(status);
    expect(menu.getAllByRole('button').map(button => button.textContent)).toEqual([
      'Settings', 'Account & cloud', 'Add Score', 'How to Use Guide', 'About Score Tone',
    ]);
    expect(menu.queryByRole('button', { name: /connect|choose.*account|sign in|sign out|import from.*drive/i })).toBeNull();
    expect(menu.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the quick theme toggle independent of Settings', () => {
    const { props, rerender } = mount();
    const toggle = screen.getByRole('button', { name: 'Toggle theme' });
    expect(toggle.title).toBe('Switch to Light mode');
    fireEvent.click(toggle);
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1);
    expect(props.onSettingsChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<HeaderBar {...props} theme="light" />);
    expect(toggle.title).toBe('Switch to Dark mode');
    fireEvent.click(toggle);
    expect(props.onToggleTheme).toHaveBeenCalledTimes(2);
  });

  it('forwards controlled appearance changes without replacing unrelated settings', () => {
    const { props, rerender } = mount();
    openSettings('Settings');
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    const updated = { ...settings, theme: 'light' as const };
    expect(props.onSettingsChange).toHaveBeenCalledTimes(1);
    expect(props.onSettingsChange).toHaveBeenCalledWith(updated);
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
    rerender(<HeaderBar {...props} settings={updated} theme="light" />);
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('true');
    expect(props.onToggleTheme).not.toHaveBeenCalled();
  });

  it.each([
    { remembered: false, token: null, action: 'Connect Google Drive' },
    { remembered: true, token: null, action: 'Reconnect Google Drive' },
    { remembered: true, token: 'cached-token', action: 'Import from Google Drive' },
  ])('unmounts Settings synchronously before $action invokes its callback', ({ remembered, token, action }) => {
    vi.mocked(googleDriveService.getUserProfile).mockReturnValue(remembered ? profile : null);
    const onOpenDrive = vi.fn(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.body.style.overflow).not.toBe('hidden');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Account and settings' }));
    });
    mount({ driveToken: token, onOpenDrive });
    openSettings('Account & cloud');
    expect(onOpenDrive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(onOpenDrive).toHaveBeenCalledTimes(1);
  });

  it('closes Settings before device import, including offline', () => {
    const onAddScore = vi.fn(() => expect(screen.queryByRole('dialog')).toBeNull());
    const { props } = mount({ isOnline: false, onAddScore });
    openSettings('Account & cloud');
    fireEvent.click(screen.getByRole('button', { name: 'Import from device' }));
    expect(onAddScore).toHaveBeenCalledTimes(1);
    expect(props.onOpenDrive).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('forwards choose-account busy and error state while retaining the modal', () => {
    const { props, rerender } = mount();
    openSettings('Account & cloud');
    fireEvent.click(screen.getByRole('button', { name: 'Choose Google account' }));
    expect(props.onChooseAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeTruthy();
    rerender(<HeaderBar {...props} cloudBusy />);
    const choose = screen.getByRole('button', { name: 'Choose Google account' }) as HTMLButtonElement;
    expect(choose.disabled).toBe(true);
    fireEvent.click(choose);
    expect(props.onChooseAccount).toHaveBeenCalledTimes(1);
    rerender(<HeaderBar {...props} cloudError="Could not switch Google accounts." />);
    expect(screen.getByRole('alert').textContent).toBe('Could not switch Google accounts.');
    expect(choose.disabled).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('No account connected · Device library');
  });
});

function openAddScore(entry: 'desktop' | 'mobile') {
  const account = screen.getByRole('button', { name: 'Account and settings' });
  let trigger: HTMLElement;
  if (entry === 'mobile') {
    fireEvent.click(account);
    const menu = document.getElementById(account.getAttribute('aria-controls')!)!;
    trigger = within(menu).getByRole('button', { name: 'Add Score' });
    // Responsive visibility is CSS-driven; select the mobile disclosure entry explicitly.
    expect(trigger.className).toContain('sm:hidden');
  } else {
    trigger = screen.getByRole('button', { name: 'Add Score' });
    expect(trigger.className).toContain('hidden sm:inline-flex');
  }
  expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  expect(trigger.title).toBe('Choose where to import a score from');
  fireEvent.click(trigger);
  expect(account.getAttribute('aria-expanded')).toBe('false');
  expect(account.hasAttribute('aria-controls')).toBe(false);
  expect(screen.queryByRole('button', { name: 'Account & cloud' })).toBeNull();
  return entry === 'mobile' ? account : trigger;
}

describe('HeaderBar quick source dropdown', () => {
  it('opens exactly two list items from the arrow without opening the modal', () => {
    const { props } = mount();
    const arrow = screen.getByRole('button', { name: 'Quick add score sources' });
    fireEvent.click(arrow);
    const list = screen.getByRole('list', { name: 'Score sources' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getAllByRole('button').map(button => button.textContent)).toEqual(['From this device', 'From Google Drive']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(props.onAddScore).not.toHaveBeenCalled();
    expect(props.onOpenDrive).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(within(list).getByRole('button', { name: 'From this device' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(list).getByRole('button', { name: 'From Google Drive' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('list', { name: 'Score sources' })).toBeNull();
    expect(document.activeElement).toBe(arrow);
  });

  it.each(['From this device', 'From Google Drive'])('closes the dropdown before invoking %s directly', source => {
    const callback = vi.fn(() => {
      expect(screen.queryByRole('list', { name: 'Score sources' })).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const { props } = mount(source === 'From this device' ? { onAddScore: callback } : { onOpenDrive: callback });
    fireEvent.click(screen.getByRole('button', { name: 'Quick add score sources' }));
    fireEvent.click(screen.getByRole('button', { name: source }));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(source === 'From this device' ? props.onOpenDrive : props.onAddScore).not.toHaveBeenCalled();
  });

  it.each([{ isOnline: false }, { isGoogleConfigured: false }, { cloudBusy: true }, { onOpenDrive: undefined }])('disables unavailable cloud import without disabling local import: %j', patch => {
    const { props } = mount(patch);
    fireEvent.click(screen.getByRole('button', { name: 'Quick add score sources' }));
    const cloud = screen.getByRole('button', { name: 'From Google Drive' }) as HTMLButtonElement;
    expect(cloud.disabled).toBe(true);
    const local = screen.getByRole('button', { name: 'From this device' }) as HTMLButtonElement;
    expect(local.disabled).toBe(false);
    fireEvent.click(local);
    expect(props.onAddScore).toHaveBeenCalledTimes(1);
  });

  it('dismisses on outside interaction and keeps the main button modal available', () => {
    mount();
    const arrow = screen.getByRole('button', { name: 'Quick add score sources' });
    fireEvent.click(arrow);
    fireEvent.pointerDown(document.body);
    expect(arrow.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(arrow);
    fireEvent.click(screen.getByRole('button', { name: 'Add Score' }));
    expect(screen.queryByRole('list', { name: 'Score sources' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Add Score' })).toBeTruthy();
  });
});

describe('HeaderBar Add Score chooser', () => {
  it.each(['desktop', 'mobile'] as const)('opens the %s chooser without importing or authenticating', entry => {
    const { props } = mount();
    openAddScore(entry);
    const dialog = screen.getByRole('dialog', { name: 'Add Score' });
    expect(within(dialog).getByRole('button', { name: 'From this device' })).toBe(document.activeElement);
    expect(within(dialog).getByRole('button', { name: 'From Google Drive' })).toBeTruthy();
    expect(props.onAddScore).not.toHaveBeenCalled();
    expect(props.onOpenDrive).not.toHaveBeenCalled();
    expect(props.onChooseAccount).not.toHaveBeenCalled();
  });

  it.each([
    { entry: 'desktop', action: 'From this device' },
    { entry: 'mobile', action: 'From this device' },
    { entry: 'desktop', action: 'From Google Drive' },
    { entry: 'mobile', action: 'From Google Drive' },
  ] as const)('unmounts the $entry chooser and restores focus before $action synchronously', ({ entry, action }) => {
    let returnFocus: HTMLElement;
    const callback = vi.fn(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.body.style.overflow).not.toBe('hidden');
      expect(document.activeElement).toBe(returnFocus);
    });
    const { props } = mount(action === 'From this device' ? { onAddScore: callback } : { onOpenDrive: callback });
    returnFocus = openAddScore(entry);
    expect(callback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(action === 'From this device' ? props.onOpenDrive : props.onAddScore).not.toHaveBeenCalled();
    expect(props.onChooseAccount).not.toHaveBeenCalled();
  });

  it.each([
    { entry: 'desktop', cancel: 'Escape' }, { entry: 'mobile', cancel: 'Escape' },
    { entry: 'desktop', cancel: 'close' }, { entry: 'mobile', cancel: 'close' },
    { entry: 'desktop', cancel: 'backdrop' }, { entry: 'mobile', cancel: 'backdrop' },
  ] as const)('cancels $entry via $cancel, restores the correct trigger, and supports reopening', ({ entry, cancel }) => {
    const { props } = mount();
    const trigger = openAddScore(entry);
    if (cancel === 'Escape') fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    else if (cancel === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close Add Score' }));
    else fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(props.onAddScore).not.toHaveBeenCalled();
    expect(props.onOpenDrive).not.toHaveBeenCalled();
    expect(props.onChooseAccount).not.toHaveBeenCalled();
    openAddScore(entry);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('forwards live profile, token, offline, configuration, callback and busy state without starting auth', () => {
    const { props, rerender } = mount();
    openAddScore('desktop');
    expect(screen.getByRole('status').textContent).toContain('Sign in with Google');
    vi.mocked(googleDriveService.getUserProfile).mockReturnValue(profile);
    rerender(<HeaderBar {...props} />);
    expect(screen.getByRole('status').textContent).toContain('Account remembered · Drive reconnect required');
    rerender(<HeaderBar {...props} driveToken="cached-token" />);
    expect(screen.getByRole('status').textContent).toContain('Google Drive connected');
    const drive = screen.getByRole('button', { name: 'From Google Drive' }) as HTMLButtonElement;
    const device = screen.getByRole('button', { name: 'From this device' }) as HTMLButtonElement;
    for (const patch of [{ isOnline: false }, { isGoogleConfigured: false }, { onOpenDrive: undefined }, { cloudBusy: true }]) {
      rerender(<HeaderBar {...props} {...patch} />);
      expect(drive.disabled).toBe(true);
      expect(device.disabled).toBe(false);
      fireEvent.click(drive);
    }
    expect(props.onOpenDrive).not.toHaveBeenCalled();
    expect(props.onChooseAccount).not.toHaveBeenCalled();
    rerender(<HeaderBar {...props} isOnline={false} isGoogleConfigured={false} cloudBusy />);
    fireEvent.click(device);
    expect(props.onAddScore).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});