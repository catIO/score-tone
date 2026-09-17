import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddScoreDialog, type AddScoreDialogProps } from './AddScoreDialog';

const profile = { sub: 'account-a', name: 'Ada Music', email: 'ada@example.test' };

function mount(overrides: Partial<AddScoreDialogProps> = {}) {
    const props: AddScoreDialogProps = {
        onClose: vi.fn(), onAddScore: vi.fn(), onOpenDrive: vi.fn(),
        profile: null, connected: false, configured: true, online: true,
        ...overrides,
    };
    return { ...render(<StrictMode><AddScoreDialog {...props} /></StrictMode>), props };
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('AddScoreDialog sources', () => {
    it('renders a labelled portal with supported formats and exactly two honest source choices', () => {
        const { container, props } = mount();
        const dialog = screen.getByRole('dialog', { name: 'Add Score' });
        expect(container.contains(dialog)).toBe(false);
        expect(document.body.contains(dialog)).toBe(true);
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        const description = document.getElementById(dialog.getAttribute('aria-describedby')!)!;
        expect(description.textContent).toContain('PDF, MusicXML (.xml, .musicxml), and compressed MusicXML (.mxl)');
        expect(within(dialog).getAllByRole('button').map(button => button.getAttribute('aria-label') || document.getElementById(button.getAttribute('aria-labelledby')!)?.textContent)).toEqual([
            'Close Add Score', 'From this device', 'From Google Drive',
        ]);
        expect(screen.getByText(/Works offline, no account needed.*not uploaded/)).toBeTruthy();
        expect(screen.getByText(/Google Drive is the only supported cloud provider.*Other cloud services: download the file/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /dropbox|onedrive|icloud|add provider/i })).toBeNull();
        expect(props.onAddScore).not.toHaveBeenCalled();
        expect(props.onOpenDrive).not.toHaveBeenCalled();
        expect(props.onClose).not.toHaveBeenCalled();
    });

    it.each([
        { name: 'no account', profile: null, connected: false, text: 'Sign in with Google to browse and select a score.' },
        { name: 'remembered account', profile, connected: false, text: 'Account remembered · Drive reconnect required.' },
        { name: 'connected account', profile, connected: true, text: 'Google Drive connected. Browse and select a score.' },
        { name: 'connected without profile', profile: null, connected: true, text: 'Google Drive connected. Browse and select a score.' },
    ])('explains $name without invoking cloud actions until selected', ({ name: _name, text, ...state }) => {
        const { props } = mount(state);
        expect(screen.getByRole('status').textContent).toContain(text);
        const drive = screen.getByRole('button', { name: 'From Google Drive' }) as HTMLButtonElement;
        expect(drive.disabled).toBe(false);
        expect(drive.getAttribute('aria-describedby')).toBe(screen.getByRole('status').id);
        expect(props.onOpenDrive).not.toHaveBeenCalled();
        fireEvent.click(drive);
        expect(props.onOpenDrive).toHaveBeenCalledTimes(1);
        expect(props.onAddScore).not.toHaveBeenCalled();
    });

    it.each([
        { name: 'offline', overrides: { online: false }, reason: 'You’re offline. Connect to the internet' },
        { name: 'offline with token', overrides: { online: false, connected: true, profile }, reason: 'You’re offline. Connect to the internet' },
        { name: 'unconfigured', overrides: { configured: false }, reason: 'Google Drive is not configured for this installation.' },
        { name: 'missing callback', overrides: { onOpenDrive: undefined }, reason: 'Google Drive import is unavailable in this view.' },
        { name: 'busy', overrides: { cloudBusy: true }, reason: 'Working… Please wait for the current cloud action to finish.' },
        { name: 'offline, unconfigured and busy', overrides: { online: false, configured: false, cloudBusy: true }, reason: 'You’re offline. Connect to the internet' },
    ])('disables cloud only when $name and explains why', ({ overrides, reason }) => {
        const { props } = mount(overrides);
        const drive = screen.getByRole('button', { name: 'From Google Drive' }) as HTMLButtonElement;
        const device = screen.getByRole('button', { name: 'From this device' }) as HTMLButtonElement;
        expect(drive.disabled).toBe(true);
        expect(drive.getAttribute('aria-busy')).toBe(String(Boolean(overrides.cloudBusy)));
        expect(screen.getByRole('status').textContent).toContain(reason);
        if (overrides.online === false) expect(screen.getByRole('status').textContent).not.toContain('Google Drive connected');
        expect(device.disabled).toBe(false);
        fireEvent.click(drive);
        if (props.onOpenDrive) expect(props.onOpenDrive).not.toHaveBeenCalled();
        fireEvent.click(device);
        expect(props.onAddScore).toHaveBeenCalledTimes(1);
        expect(props.onClose).not.toHaveBeenCalled();
    });

    it('updates connection, availability, busy state, and callbacks live without reopening or authenticating', () => {
        const { props, rerender } = mount();
        const dialog = screen.getByRole('dialog');
        const device = screen.getByRole('button', { name: 'From this device' });
        const drive = screen.getByRole('button', { name: 'From Google Drive' }) as HTMLButtonElement;
        const update = (patch: Partial<AddScoreDialogProps>) => rerender(<StrictMode><AddScoreDialog {...props} {...patch} /></StrictMode>);
        update({ profile });
        expect(screen.getByRole('status').textContent).toContain('Drive reconnect required');
        update({ profile, connected: true });
        expect(screen.getByRole('status').textContent).toContain('Google Drive connected');
        for (const patch of [{ online: false }, { configured: false }, { cloudBusy: true }, { onOpenDrive: undefined }]) {
            update(patch);
            expect(drive.disabled).toBe(true);
            expect(screen.getByRole('dialog')).toBe(dialog);
            expect(document.activeElement).toBe(device);
        }
        const onOpenDrive = vi.fn();
        update({ onOpenDrive, connected: true });
        expect(drive.disabled).toBe(false);
        expect(props.onOpenDrive).not.toHaveBeenCalled();
        expect(onOpenDrive).not.toHaveBeenCalled();
        fireEvent.click(drive);
        expect(onOpenDrive).toHaveBeenCalledTimes(1);
        expect(props.onAddScore).not.toHaveBeenCalled();
    });
});

describe('AddScoreDialog modal lifecycle', () => {
    it('focuses device import and restores the invoker and previous body overflow in Strict Mode', () => {
        const previousOverflow = document.body.style.overflow;
        const trigger = document.createElement('button');
        document.body.append(trigger);
        trigger.focus();
        document.body.style.overflow = 'scroll';
        try {
            const { unmount } = mount();
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'From this device' }));
            expect(document.body.style.overflow).toBe('hidden');
            unmount();
            expect(document.activeElement).toBe(trigger);
            expect(document.body.style.overflow).toBe('scroll');
            trigger.focus();
            expect(document.activeElement).toBe(trigger);
        } finally {
            cleanup();
            trigger.remove();
            document.body.style.overflow = previousOverflow;
        }
    });

    it.each([true, false])('traps focus, including external focus attempts, when online=%s', online => {
        mount({ online });
        const first = screen.getByRole('button', { name: 'Close Add Score' });
        const last = screen.getByRole('button', { name: online ? 'From Google Drive' : 'From this device' });
        first.focus();
        // jsdom cannot perform native Tab traversal; test the explicit trap boundaries.
        expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(false);
        expect(document.activeElement).toBe(last);
        expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(false);
        expect(document.activeElement).toBe(first);
        expect(fireEvent.keyDown(first, { key: 'Tab' })).toBe(true);
        const outside = document.createElement('button');
        document.body.append(outside);
        try {
            outside.focus();
            expect(document.activeElement).toBe(first);
            const dialog = screen.getByRole('dialog');
            dialog.focus();
            fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
            expect(document.activeElement).toBe(last);
            dialog.focus();
            fireEvent.keyDown(dialog, { key: 'Tab' });
            expect(document.activeElement).toBe(first);
        } finally {
            outside.remove();
        }
    });

    it('recalculates focus boundaries when cloud becomes disabled while open', () => {
        const { props, rerender } = mount();
        rerender(<StrictMode><AddScoreDialog {...props} cloudBusy /></StrictMode>);
        const first = screen.getByRole('button', { name: 'Close Add Score' });
        first.focus();
        fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'From this device' }));
    });

    it('uses the latest Escape callback and removes document listeners on unmount', () => {
        const { props, rerender, unmount } = mount();
        const onClose = vi.fn();
        rerender(<StrictMode><AddScoreDialog {...props} onClose={onClose} /></StrictMode>);
        expect(fireEvent.keyDown(document.activeElement!, { key: 'Escape' })).toBe(false);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(props.onClose).not.toHaveBeenCalled();
        expect(props.onOpenDrive).not.toHaveBeenCalled();
        expect(props.onAddScore).not.toHaveBeenCalled();
        unmount();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on the close button or backdrop, but not interior clicks, without importing', () => {
        const { props } = mount();
        const dialog = screen.getByRole('dialog');
        fireEvent.click(screen.getByRole('heading', { name: 'Add Score' }));
        fireEvent.click(dialog);
        expect(props.onClose).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Close Add Score' }));
        expect(props.onClose).toHaveBeenCalledTimes(1);
        fireEvent.click(dialog.parentElement!);
        expect(props.onClose).toHaveBeenCalledTimes(2);
        expect(props.onAddScore).not.toHaveBeenCalled();
        expect(props.onOpenDrive).not.toHaveBeenCalled();
    });
});