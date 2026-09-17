import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSettingsDialog, type AppSettingsDialogProps, type AppSettingsTab } from './AppSettingsDialog';
import type { AppSettings } from '../services/settingsService';
import type { GoogleUserProfile } from '../services/googleDriveService';

const profile: GoogleUserProfile = { sub: 'account-a', name: 'Ada Music', email: 'ada@example.test' };

function createSettings(): AppSettings {
  return {
    theme: 'dark', lastPreset: 'Custom',
    customSliders: { sepia: 35, brightness: 85, contrast: 125, warmth: 20, invert: true, highContrast: true, backgroundColor: '#fffabc', inkDarkness: 45 },
    fitMode: 'height', scrollMode: 'single', tapZoneWidth: 20,
    autoHideControls: true, twoPageLandscape: true, keepScreenAwake: true, showRightHandFingering: true,
  };
}

function createProps(overrides: Partial<AppSettingsDialogProps> = {}): AppSettingsDialogProps {
  return {
    tab: 'general', onTabChange: vi.fn(), onClose: vi.fn(),
    settings: createSettings(), onSettingsChange: vi.fn(),
    profile: null, connected: false, configured: true, online: true,
    onOpenDrive: vi.fn(), onChooseAccount: vi.fn(), onDriveLogout: vi.fn(), onAddScore: vi.fn(),
    ...overrides,
  };
}

function mount(overrides: Partial<AppSettingsDialogProps> = {}) {
  const props = createProps(overrides);
  return { ...render(<AppSettingsDialog {...props} />), props };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AppSettingsDialog controlled preferences', () => {
  it.each([
    ['Light', 'theme', 'light'],
    ['Continuous', 'scrollMode', 'continuous'],
    ['Width', 'fitMode', 'width'],
  ] as const)('updates %s only when the parent supplies the new settings', (label, key, value) => {
    const { props, rerender } = mount();
    const before = structuredClone(props.settings);
    const button = screen.getByRole('button', { name: label });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    const updated = { ...props.settings, [key]: value };
    expect(props.onSettingsChange).toHaveBeenCalledTimes(1);
    expect(props.onSettingsChange).toHaveBeenCalledWith(updated);
    expect(props.settings).toEqual(before);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    rerender(<AppSettingsDialog {...props} settings={updated} />);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    const group = within(button.closest('fieldset')!);
    expect(group.getAllByRole('button').filter(item => item.getAttribute('aria-pressed') === 'true')).toEqual([button]);
  });

  it.each([
    ['Two-page landscape', 'twoPageLandscape'],
    ['Auto-hide controls', 'autoHideControls'],
    ['Keep screen awake', 'keepScreenAwake'],
    ['Right-hand fingering', 'showRightHandFingering'],
  ] as const)('controls %s without losing filter settings and can toggle it back', (label, key) => {
    const { props, rerender } = mount();
    const toggle = screen.getByRole('checkbox', { name: label }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    const updated = { ...props.settings, [key]: false };
    expect(props.onSettingsChange).toHaveBeenCalledTimes(1);
    expect(props.onSettingsChange).toHaveBeenCalledWith(updated);
    expect(toggle.checked).toBe(true);
    rerender(<AppSettingsDialog {...props} settings={updated} />);
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(props.onSettingsChange).toHaveBeenLastCalledWith(props.settings);
  });

  it('exposes the tap width range and emits a numeric controlled value preserving other preferences', () => {
    const { props, rerender } = mount();
    const slider = screen.getByRole('slider', { name: /Tap zone width/ }) as HTMLInputElement;
    expect([slider.min, slider.max, slider.step, slider.value]).toEqual(['10', '40', '5', '20']);
    expect(slider.getAttribute('aria-valuetext')).toBe('20%');
    fireEvent.change(slider, { target: { value: '35' } });
    const updated = { ...props.settings, tapZoneWidth: 35 };
    expect(props.onSettingsChange).toHaveBeenCalledTimes(1);
    expect(props.onSettingsChange).toHaveBeenCalledWith(updated);
    expect(slider.value).toBe('20');
    rerender(<AppSettingsDialog {...props} settings={updated} />);
    expect(slider.value).toBe('35');
    expect(slider.getAttribute('aria-valuetext')).toBe('35%');
  });
});

describe('AppSettingsDialog accessibility', () => {
  it.each(['general', 'account'] as const)('focuses the initial %s tab and restores the invoker and scroll state on unmount', tab => {
    const previousOverflow = document.body.style.overflow;
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    document.body.style.overflow = 'scroll';
    try {
      const { unmount } = mount({ tab });
      expect(screen.getByRole('dialog', { name: 'Settings' }).getAttribute('aria-modal')).toBe('true');
      expect(document.activeElement).toBe(screen.getByRole('tab', { selected: true }));
      expect(document.body.style.overflow).toBe('hidden');
      unmount();
      expect(document.activeElement).toBe(trigger);
      expect(document.body.style.overflow).toBe('scroll');
    } finally {
      cleanup();
      trigger.remove();
      document.body.style.overflow = previousOverflow;
    }
  });

  it('supports wrapping arrow keys, Home/End, and controlled tab/panel relationships', () => {
    const props = createProps();
    function Harness() {
      const [tab, setTab] = useState<AppSettingsTab>('general');
      return <AppSettingsDialog {...props} tab={tab} onTabChange={value => { props.onTabChange(value); setTab(value); }} />;
    }
    render(<Harness />);
    const general = screen.getByRole('tab', { name: 'General' });
    const account = screen.getByRole('tab', { name: 'Account & cloud' });
    for (const [key, target, value] of [
      ['ArrowRight', account, 'account'], ['ArrowRight', general, 'general'],
      ['ArrowLeft', account, 'account'], ['ArrowLeft', general, 'general'],
      ['End', account, 'account'], ['Home', general, 'general'],
    ] as const) {
      fireEvent.keyDown(document.activeElement!, { key });
      expect(props.onTabChange).toHaveBeenLastCalledWith(value);
      expect(document.activeElement).toBe(target);
      expect(target.getAttribute('aria-selected')).toBe('true');
      expect(target.tabIndex).toBe(0);
      const other = target === general ? account : general;
      expect(other.getAttribute('aria-selected')).toBe('false');
      expect(other.tabIndex).toBe(-1);
      const panel = screen.getByRole('tabpanel');
      expect(panel.id).toBe(target.getAttribute('aria-controls'));
      expect(panel.getAttribute('aria-labelledby')).toBe(target.id);
      expect(document.getElementById(other.getAttribute('aria-controls')!)!.hidden).toBe(true);
    }
    fireEvent.click(account);
    expect(account.getAttribute('aria-selected')).toBe('true');
  });

  it('leaves selected tab controlled until the parent updates it', () => {
    const { props } = mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Account & cloud' }));
    expect(props.onTabChange).toHaveBeenCalledTimes(1);
    expect(props.onTabChange).toHaveBeenCalledWith('account');
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('General');
  });

  it.each(['general', 'account'] as const)('traps focus on the %s panel, skipping hidden panels and disabled cloud actions', tab => {
    mount({ tab, online: false });
    const first = screen.getByRole('button', { name: 'Close settings' });
    const last = tab === 'general'
      ? screen.getByRole('slider', { name: /Tap zone width/ })
      : screen.getByRole('button', { name: 'Import from device' });
    // jsdom does not implement native Tab navigation; exercise the explicit boundary trap.
    first.focus();
    expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(last);
    expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(first);
    const selectedTab = screen.getByRole('tab', { selected: true });
    selectedTab.focus();
    expect(fireEvent.keyDown(selectedTab, { key: 'Tab' })).toBe(true);

    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      outside.focus();
      expect(document.activeElement).toBe(first);
      screen.getByRole('dialog').focus();
      fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(last);
    } finally {
      outside.remove();
    }
  });

  it('uses the latest close callback for Escape and removes its document listeners on unmount', () => {
    const { props, rerender, unmount } = mount();
    const onClose = vi.fn();
    rerender(<AppSettingsDialog {...props} onClose={onClose} />);
    expect(fireEvent.keyDown(document.activeElement!, { key: 'Escape' })).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AppSettingsDialog Account & cloud', () => {
  it.each([
    { name: 'disconnected', profile: null, connected: false, online: true, status: 'No account connected · Device library', action: 'Connect Google Drive' },
    { name: 'remembered', profile, connected: false, online: true, status: 'Account remembered · Drive reconnect required', action: 'Reconnect Google Drive' },
    { name: 'active', profile, connected: true, online: true, status: 'Google Drive connected', action: 'Import from Google Drive' },
    { name: 'offline remembered', profile, connected: false, online: false, status: 'Offline · Account remembered', action: 'Reconnect Google Drive' },
    { name: 'offline with cached token', profile, connected: true, online: false, status: 'Offline · Account remembered', action: 'Import from Google Drive' },
    { name: 'offline device', profile: null, connected: false, online: false, status: 'Offline · Device library', action: 'Connect Google Drive' },
  ])('renders truthful $name status and corresponding cloud action', ({ name: _name, status, action, ...state }) => {
    const { props } = mount({ tab: 'account', ...state });
    expect(screen.getByRole('status').textContent).toBe(status);
    const primary = screen.getByRole('button', { name: action }) as HTMLButtonElement;
    const choose = screen.getByRole('button', { name: 'Choose Google account' }) as HTMLButtonElement;
    expect(primary.disabled).toBe(!state.online);
    expect(choose.disabled).toBe(!state.online);
    fireEvent.click(primary);
    fireEvent.click(choose);
    expect(props.onOpenDrive).toHaveBeenCalledTimes(state.online ? 1 : 0);
    expect(props.onChooseAccount).toHaveBeenCalledTimes(state.online ? 1 : 0);
    if (state.profile) {
      expect(screen.getByRole('heading', { name: profile.name })).toBeTruthy();
      expect(screen.getByText(profile.email!)).toBeTruthy();
    } else {
      expect(screen.queryByRole('button', { name: /Disconnect/ })).toBeNull();
    }
    if (!state.online) expect(screen.getByText(/You’re offline/)).toBeTruthy();
  });

  it('disables cloud actions when this installation is not configured but permits device import', () => {
    const { props } = mount({ tab: 'account', configured: false });
    expect(screen.getByText('Google Drive is not configured for this installation.')).toBeTruthy();
    for (const name of ['Connect Google Drive', 'Choose Google account']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Import from device' }));
    expect(props.onAddScore).toHaveBeenCalledTimes(1);
    expect(props.onOpenDrive).not.toHaveBeenCalled();
    expect(props.onChooseAccount).not.toHaveBeenCalled();
  });

  it('disables missing cloud/disconnect handlers rather than presenting fake working actions', () => {
    mount({ tab: 'account', profile, onOpenDrive: undefined, onChooseAccount: undefined, onDriveLogout: undefined });
    for (const name of ['Reconnect Google Drive', 'Choose Google account', 'Disconnect · use device library']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('reports busy account selection, prevents duplicate actions, and presents recoverable errors without claiming connection', () => {
    const { props, rerender } = mount({ tab: 'account', profile });
    const choose = screen.getByRole('button', { name: 'Choose Google account' }) as HTMLButtonElement;
    fireEvent.click(choose);
    expect(props.onChooseAccount).toHaveBeenCalledTimes(1);
    rerender(<AppSettingsDialog {...props} cloudBusy />);
    const working = screen.getByRole('button', { name: 'Working…' }) as HTMLButtonElement;
    expect(working.disabled).toBe(true);
    expect(choose.disabled).toBe(true);
    expect(working.closest('[aria-busy]')!.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(working);
    fireEvent.click(choose);
    expect(props.onOpenDrive).not.toHaveBeenCalled();
    expect(props.onChooseAccount).toHaveBeenCalledTimes(1);
    rerender(<AppSettingsDialog {...props} cloudError="Account selection was cancelled. Please try again." />);
    expect(screen.getByRole('alert').textContent).toBe('Account selection was cancelled. Please try again.');
    expect(choose.disabled).toBe(false);
    expect(choose.closest('[aria-busy]')!.getAttribute('aria-busy')).toBe('false');
    expect(screen.getByRole('status').textContent).toBe('Account remembered · Drive reconnect required');
    fireEvent.click(choose);
    expect(props.onChooseAccount).toHaveBeenCalledTimes(2);
    rerender(<AppSettingsDialog {...props} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps disconnect and device import available offline, unconfigured, and during cloud work', () => {
    const { props } = mount({ tab: 'account', profile, online: false, configured: false, cloudBusy: true });
    const disconnect = screen.getByRole('button', { name: 'Disconnect · use device library' }) as HTMLButtonElement;
    const local = screen.getByRole('button', { name: 'Import from device' }) as HTMLButtonElement;
    expect(disconnect.disabled).toBe(false);
    expect(local.disabled).toBe(false);
    fireEvent.click(disconnect);
    fireEvent.click(local);
    expect(props.onDriveLogout).toHaveBeenCalledTimes(1);
    expect(props.onAddScore).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/It does not delete scores or revoke Google access/)).toBeTruthy();
    expect(props.onOpenDrive).not.toHaveBeenCalled();
    expect(props.onChooseAccount).not.toHaveBeenCalled();
  });

  it('does not invent unsupported provider connections and offers device import instead', () => {
    const { props } = mount({ tab: 'account' });
    expect(screen.getByText(/Google Drive is the only supported cloud provider/)).toBeTruthy();
    expect(screen.getByText(/Other cloud providers are not yet supported/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /dropbox|onedrive|icloud|add provider/i })).toBeNull();
    expect(within(screen.getByRole('tabpanel')).getAllByRole('button').map(button => button.textContent)).toEqual([
      'Connect Google Drive', 'Choose Google account', 'Import from device',
    ]);
    const permissions = screen.getByRole('link', { name: /Manage Google permissions/ });
    expect(permissions.getAttribute('href')).toBe('https://myaccount.google.com/connections');
    expect(permissions.getAttribute('rel')).toContain('noopener');
    fireEvent.click(screen.getByRole('button', { name: 'Import from device' }));
    expect(props.onAddScore).toHaveBeenCalledTimes(1);
  });
});