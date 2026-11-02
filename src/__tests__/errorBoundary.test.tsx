import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import ErrorBoundary from '../components/ErrorBoundary';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function ThrowingComponent({ message = 'Test explosion' }: { message?: string }): React.ReactNode {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    consoleErrorSpy.mockRestore();
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

  it('renders children normally when no error occurs', async () => {
    await act(async () => {
      root!.render(
        <ErrorBoundary>
          <div id="child-content">Normal Content</div>
        </ErrorBoundary>
      );
    });

    const child = container?.querySelector('#child-content');
    expect(child).not.toBeNull();
    expect(child?.textContent).toBe('Normal Content');
    expect(container?.querySelector('#error-boundary-card')).toBeNull();
  });

  it('catches render error and shows diagnostic fallback card without clearing localStorage', async () => {
    localStorage.setItem('keep-me', 'precious-data');

    await act(async () => {
      root!.render(
        <ErrorBoundary>
          <ThrowingComponent message="Custom genomics crash" />
        </ErrorBoundary>
      );
    });

    const fallback = container?.querySelector('#error-boundary-card');
    expect(fallback).not.toBeNull();

    // Check message
    expect(fallback?.textContent).toContain('Custom genomics crash');
    expect(fallback?.textContent).toContain('Something went wrong');

    // Check 'Reload panel' button
    const reloadBtn = fallback?.querySelector('#btn-error-reload') as HTMLButtonElement | null;
    expect(reloadBtn).not.toBeNull();
    expect(reloadBtn?.textContent?.trim()).toBe('Reload panel');

    // Check collapsed details with error text
    const details = fallback?.querySelector('details') as HTMLDetailsElement | null;
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain('Error details');
    expect(details?.textContent).toContain('Custom genomics crash');

    // Verify localStorage was not cleared (no data loss)
    expect(localStorage.getItem('keep-me')).toBe('precious-data');
    localStorage.removeItem('keep-me');
  });

  it('calls window.location.reload when "Reload panel" is clicked', async () => {
    const originalReload = window.location.reload;
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, reload: reloadMock },
    });

    await act(async () => {
      root!.render(
        <ErrorBoundary>
          <ThrowingComponent message="Reload test" />
        </ErrorBoundary>
      );
    });

    const reloadBtn = container?.querySelector('#btn-error-reload') as HTMLButtonElement;
    expect(reloadBtn).not.toBeNull();

    await act(async () => {
      reloadBtn.click();
    });

    expect(reloadMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, reload: originalReload },
    });
  });
});
