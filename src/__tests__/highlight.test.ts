import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { highlightRow, EMPTY_SENTINEL } from '../content/highlight';

describe('highlightRow (Bug 1.8)', () => {
  let row: HTMLTableRowElement;

  beforeEach(() => {
    vi.useFakeTimers();
    const table = document.createElement('table');
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    tr.appendChild(td);
    table.appendChild(tr);
    document.body.appendChild(table);
    row = tr;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('highlights an element with no initial background and restores it after 4s', () => {
    row.style.backgroundColor = '';
    row.style.transition = '';

    highlightRow(row);

    expect(row.style.backgroundColor).toBe('rgb(254, 240, 138)');
    expect(row.style.outline).toBe('2px solid #eab308');
    expect(row.dataset.vhOriginalBg).toBe(EMPTY_SENTINEL);

    vi.advanceTimersByTime(4000);

    expect(row.style.backgroundColor).toBe('');
    expect(row.style.outline).toBe('');
    expect(row.dataset.vhOriginalBg).toBeUndefined();

    vi.advanceTimersByTime(300);
    expect(row.style.transition).toBe('');
    expect(row.dataset.vhOriginalTransition).toBeUndefined();
  });

  it('highlights an element with an existing background and restores it', () => {
    row.style.backgroundColor = 'rgb(0, 0, 255)';
    row.style.transition = 'all 0.5s ease';

    highlightRow(row);

    expect(row.style.backgroundColor).toBe('rgb(254, 240, 138)');
    expect(row.dataset.vhOriginalBg).toBe('rgb(0, 0, 255)');

    vi.advanceTimersByTime(4000);

    expect(row.style.backgroundColor).toBe('rgb(0, 0, 255)');
    expect(row.dataset.vhOriginalBg).toBeUndefined();

    vi.advanceTimersByTime(300);
    expect(row.style.transition).toBe('all 0.5s ease');
    expect(row.dataset.vhOriginalTransition).toBeUndefined();
  });

  it('does not capture highlight color on rapid re-calls within 4s and does not freeze highlight forever', () => {
    row.style.backgroundColor = '';

    // First call at t=0
    highlightRow(row);
    expect(row.style.backgroundColor).toBe('rgb(254, 240, 138)');
    expect(row.dataset.vhOriginalBg).toBe(EMPTY_SENTINEL);

    // Advance 1.5s
    vi.advanceTimersByTime(1500);

    // Second call at t=1500ms while still highlighted
    highlightRow(row);
    // Crucial: dataset.vhOriginalBg must NOT be captured as the yellow highlight (#fef08a / rgb(254, 240, 138))
    expect(row.dataset.vhOriginalBg).toBe(EMPTY_SENTINEL);

    // Advance to t=4000ms (2500ms since second call, 4000ms since first call)
    vi.advanceTimersByTime(2500);
    // First timer was cancelled, so highlight is still active from second call
    expect(row.style.backgroundColor).toBe('rgb(254, 240, 138)');

    // Advance 1500ms more (t=5500ms total, 4000ms since second call)
    vi.advanceTimersByTime(1500);
    // Now second timer has expired: original background (empty string) must be restored!
    expect(row.style.backgroundColor).toBe('');
    expect(row.style.outline).toBe('');
    expect(row.dataset.vhOriginalBg).toBeUndefined();
  });

  it('preserves existing non-empty background across rapid re-calls', () => {
    row.style.backgroundColor = 'rgb(128, 0, 128)';

    highlightRow(row);
    expect(row.dataset.vhOriginalBg).toBe('rgb(128, 0, 128)');

    vi.advanceTimersByTime(2000);
    highlightRow(row);
    expect(row.dataset.vhOriginalBg).toBe('rgb(128, 0, 128)');

    vi.advanceTimersByTime(4000);
    expect(row.style.backgroundColor).toBe('rgb(128, 0, 128)');
  });
});
