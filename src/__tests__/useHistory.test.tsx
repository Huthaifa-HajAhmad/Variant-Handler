import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useHistory } from '../hooks/useHistory';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessApi {
  history: string[];
  addToHistory: (input: string, isValid?: boolean) => void;
  removeFromHistory: (input: string) => void;
  clearHistory: () => void;
  setHistoryCap: (cap: number) => void;
}

function TestHarness({
  initial,
  onMount,
}: {
  initial: string[];
  onMount: (api: HarnessApi) => void;
}) {
  const api = useHistory(initial);
  onMount(api as HarnessApi);
  return <div id="history-count">{api.history.length}</div>;
}

describe('useHistory hook', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('adds valid items when called with 1 argument (defaulting isValid to true)', async () => {
    let api!: HarnessApi;
    await act(async () => {
      root!.render(<TestHarness initial={[]} onMount={(val) => { api = val; }} />);
    });

    await act(async () => {
      // Single-argument call as made by sidepanel
      api.addToHistory('chr7:g.140753336A>T');
    });

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(api.history).toEqual(['chr7:g.140753336A>T']);
  });

  it('records valid variant when called with (input, true)', async () => {
    let api!: HarnessApi;
    await act(async () => {
      root!.render(<TestHarness initial={[]} onMount={(val) => { api = val; }} />);
    });

    await act(async () => {
      api.addToHistory('NM_004333.6:c.1799T>A', true);
    });

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(api.history).toEqual(['NM_004333.6:c.1799T>A']);
  });

  it('rejects invalid variant when called with (input, false)', async () => {
    let api!: HarnessApi;
    await act(async () => {
      root!.render(<TestHarness initial={[]} onMount={(val) => { api = val; }} />);
    });

    await act(async () => {
      api.addToHistory('invalid_variant_garbage', false);
    });

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(api.history).toEqual([]);
  });

  it('deduplicates and brings most recent search to the front', async () => {
    let api!: HarnessApi;
    await act(async () => {
      root!.render(<TestHarness initial={[]} onMount={(val) => { api = val; }} />);
    });

    await act(async () => {
      api.addToHistory('VAR1', true);
      vi.advanceTimersByTime(700);
      api.addToHistory('VAR2', true);
      vi.advanceTimersByTime(700);
      api.addToHistory('VAR1', true);
      vi.advanceTimersByTime(700);
    });

    expect(api.history).toEqual(['VAR1', 'VAR2']);
  });

  it('respects history cap limits', async () => {
    let api!: HarnessApi;
    await act(async () => {
      root!.render(<TestHarness initial={[]} onMount={(val) => { api = val; }} />);
    });

    await act(async () => {
      api.setHistoryCap(3);
    });

    await act(async () => {
      api.addToHistory('VAR1', true);
      vi.advanceTimersByTime(700);
      api.addToHistory('VAR2', true);
      vi.advanceTimersByTime(700);
      api.addToHistory('VAR3', true);
      vi.advanceTimersByTime(700);
      api.addToHistory('VAR4', true);
      vi.advanceTimersByTime(700);
    });

    expect(api.history).toEqual(['VAR4', 'VAR3', 'VAR2']);
  });

  it('removes specific items and clears history', async () => {
    let api!: HarnessApi;
    await act(async () => {
      root!.render(<TestHarness initial={['A', 'B', 'C']} onMount={(val) => { api = val; }} />);
    });

    await act(async () => {
      api.removeFromHistory('B');
    });
    expect(api.history).toEqual(['A', 'C']);

    await act(async () => {
      api.clearHistory();
    });
    expect(api.history).toEqual([]);
  });
});
