import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import VariantInputSection from '../components/workbench/VariantInputSection';
import Header from '../components/Header';
import BottomNavBar, { NavTabId } from '../components/BottomNavBar';
import SettingsModal from '../components/SettingsModal';
import { THEMES } from '../lib/themes';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const testTheme = THEMES[0];

describe('WCAG & ARIA Specifications', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  describe('VariantInputSection ARIA', () => {
    it('provides aria-label on #variant-input', async () => {
      await act(async () => {
        root!.render(
          <VariantInputSection
            activeInput=""
            setActiveInput={() => {}}
            isLight={true}
            activeTheme={testTheme}
            triggerAlert={() => {}}
            genomeBuild="GRCh38"
            onGenomeBuildChange={() => {}}
          />
        );
      });

      const input = container?.querySelector('#variant-input');
      expect(input).not.toBeNull();
      expect(input?.getAttribute('aria-label')).toBe(
        'Genomic variant coordinate or HGVS notation'
      );
    });
  });

  describe('Header ARIA and Icon Buttons', () => {
    it('sets aria-label on icon-only theme toggle button and preserves title', async () => {
      await act(async () => {
        root!.render(
          <Header
            activeTheme={testTheme}
            onSettingsClick={() => {}}
            onThemeToggle={() => {}}
            showWhatsNewBadge={false}
            onWhatsNewClick={() => {}}
          />
        );
      });

      const themeBtn = container?.querySelector('#btn-header-theme-toggle');
      expect(themeBtn).not.toBeNull();
      expect(themeBtn?.getAttribute('aria-label')).toBe('Toggle theme');
      expect(themeBtn?.getAttribute('title')).toBeTruthy();
    });

    it('sets aria-label on icon-only settings button and preserves title', async () => {
      await act(async () => {
        root!.render(
          <Header
            activeTheme={testTheme}
            onSettingsClick={() => {}}
            onThemeToggle={() => {}}
            showWhatsNewBadge={false}
            onWhatsNewClick={() => {}}
          />
        );
      });

      const setupBtn = container?.querySelector('#btn-header-setup');
      expect(setupBtn).not.toBeNull();
      expect(setupBtn?.getAttribute('aria-label')).toBe('Open settings');
      expect(setupBtn?.getAttribute('title')).toBe('Open Workspace Settings');
    });
  });

  describe('BottomNavBar ARIA Tablist', () => {
    it('has role="tablist" container and role="tab" buttons with aria-selected and aria-label', async () => {
      const activeTab: NavTabId = 'workbench';
      await act(async () => {
        root!.render(
          <BottomNavBar
            activeTab={activeTab}
            onSelectTab={() => {}}
            activeTheme={testTheme}
            queueCount={2}
          />
        );
      });

      const tablist = container?.querySelector('[role="tablist"]');
      expect(tablist).not.toBeNull();
      expect(tablist?.id).toBe('bottom-navigation-bar');

      const tabs = container?.querySelectorAll('[role="tab"]');
      expect(tabs?.length).toBe(4);

      const workbenchTab = container?.querySelector('#nav-tab-workbench');
      expect(workbenchTab?.getAttribute('role')).toBe('tab');
      expect(workbenchTab?.getAttribute('aria-selected')).toBe('true');
      expect(workbenchTab?.getAttribute('aria-label')).toBe('Workbench');

      const launchpadTab = container?.querySelector('#nav-tab-launchpad');
      expect(launchpadTab?.getAttribute('role')).toBe('tab');
      expect(launchpadTab?.getAttribute('aria-selected')).toBe('false');
      expect(launchpadTab?.getAttribute('aria-label')).toBe('Launchpad');

      const worklistTab = container?.querySelector('#nav-tab-worklist');
      expect(worklistTab?.getAttribute('role')).toBe('tab');
      expect(worklistTab?.getAttribute('aria-selected')).toBe('false');
      expect(worklistTab?.getAttribute('aria-label')).toBe('Worklist');

      const toolsTab = container?.querySelector('#nav-tab-tools');
      expect(toolsTab?.getAttribute('role')).toBe('tab');
      expect(toolsTab?.getAttribute('aria-selected')).toBe('false');
      expect(toolsTab?.getAttribute('aria-label')).toBe('Export');
    });
  });

  describe('SettingsModal Dialog & Focus Trap', () => {
    let openerButton: HTMLButtonElement;

    beforeEach(() => {
      openerButton = document.createElement('button');
      openerButton.id = 'modal-opener-btn';
      openerButton.textContent = 'Open Modal';
      document.body.appendChild(openerButton);
      openerButton.focus();
    });

    afterEach(() => {
      if (openerButton.parentNode) {
        openerButton.parentNode.removeChild(openerButton);
      }
    });

    it('has role="dialog", aria-modal="true", aria-labelledby, and close button aria-label', async () => {
      await act(async () => {
        root!.render(
          <SettingsModal
            activeTheme={testTheme}
            themeId="indigo"
            onSelectTheme={() => {}}
            onClose={() => {}}
            liveEnrichmentEnabled={true}
            onToggleLiveEnrichment={() => {}}
            clearOnCloseEnabled={false}
            onToggleClearOnClose={() => {}}
            onClearAllData={() => {}}
            historyCap={100}
            onSetHistoryCap={() => {}}
            triggerAlert={() => {}}
          />
        );
      });

      const dialog = container?.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('aria-modal')).toBe('true');

      const labelledBy = dialog?.getAttribute('aria-labelledby');
      expect(labelledBy).toBe('settings-modal-title');

      const titleEl = container?.querySelector(`#${labelledBy}`);
      expect(titleEl).not.toBeNull();
      expect(titleEl?.textContent?.trim()).toBe('Workspace Configuration');

      const closeBtn = container?.querySelector('#settings-close-btn');
      expect(closeBtn).not.toBeNull();
      expect(closeBtn?.getAttribute('aria-label')).toBe('Close settings');
    });

    it('moves focus into dialog on open and restores focus to opener on close', async () => {
      const handleClose = vi.fn();

      await act(async () => {
        root!.render(
          <SettingsModal
            activeTheme={testTheme}
            themeId="indigo"
            onSelectTheme={() => {}}
            onClose={handleClose}
            liveEnrichmentEnabled={true}
            onToggleLiveEnrichment={() => {}}
            clearOnCloseEnabled={false}
            onToggleClearOnClose={() => {}}
            onClearAllData={() => {}}
            historyCap={100}
            onSetHistoryCap={() => {}}
            triggerAlert={() => {}}
          />
        );
      });

      const closeBtn = container?.querySelector('#settings-close-btn') as HTMLElement;
      expect(document.activeElement).toBe(closeBtn);

      // Trigger close button click
      await act(async () => {
        closeBtn.click();
      });

      expect(handleClose).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(openerButton);
    });

    it('closes on Escape key press and restores focus', async () => {
      const handleClose = vi.fn();

      await act(async () => {
        root!.render(
          <SettingsModal
            activeTheme={testTheme}
            themeId="indigo"
            onSelectTheme={() => {}}
            onClose={handleClose}
            liveEnrichmentEnabled={true}
            onToggleLiveEnrichment={() => {}}
            clearOnCloseEnabled={false}
            onToggleClearOnClose={() => {}}
            onClearAllData={() => {}}
            historyCap={100}
            onSetHistoryCap={() => {}}
            triggerAlert={() => {}}
          />
        );
      });

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(handleClose).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(openerButton);
    });

    it('traps focus inside dialog on Tab and Shift+Tab', async () => {
      await act(async () => {
        root!.render(
          <SettingsModal
            activeTheme={testTheme}
            themeId="indigo"
            onSelectTheme={() => {}}
            onClose={() => {}}
            liveEnrichmentEnabled={true}
            onToggleLiveEnrichment={() => {}}
            clearOnCloseEnabled={false}
            onToggleClearOnClose={() => {}}
            onClearAllData={() => {}}
            historyCap={100}
            onSetHistoryCap={() => {}}
            triggerAlert={() => {}}
          />
        );
      });

      const dialog = container?.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog).not.toBeNull();

      const focusableSelector = [
        'button:not([disabled])',
        '[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
      );

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      expect(first).not.toBe(last);

      // On first element: Shift+Tab should cycle to last element
      first.focus();
      expect(document.activeElement).toBe(first);

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
      });
      expect(document.activeElement).toBe(last);

      // On last element: Tab should cycle to first element
      last.focus();
      expect(document.activeElement).toBe(last);

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, bubbles: true }));
      });
      expect(document.activeElement).toBe(first);
    });
  });
});
