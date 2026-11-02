/**
 * Variant Handler — DOM Row Highlighting
 *
 * Temporarily highlights a matched table row / element in yellow.
 * Remembers the true original background and transition styles in dataset attributes
 * to prevent freezing the highlight when called repeatedly within the duration window.
 */

export const EMPTY_SENTINEL = '__EMPTY__';

const activeTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
const activeTransitionTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Highlights an element/row with yellow background and gold outline for `durationMs` (default 4000ms).
 * Cancels any existing highlight timer for the element, preserving the original styles.
 */
export function highlightRow(row: HTMLElement, durationMs = 4000): void {
  // Cancel any active timers for this element
  const existingTimer = activeTimers.get(row);
  if (existingTimer !== undefined) {
    clearTimeout(existingTimer);
    activeTimers.delete(row);
  }

  const existingTransTimer = activeTransitionTimers.get(row);
  if (existingTransTimer !== undefined) {
    clearTimeout(existingTransTimer);
    activeTransitionTimers.delete(row);
  }

  // Remember the true original background and transition once
  if (row.dataset.vhOriginalBg === undefined) {
    row.dataset.vhOriginalBg = row.style.backgroundColor === '' ? EMPTY_SENTINEL : row.style.backgroundColor;
  }
  if (row.dataset.vhOriginalTransition === undefined) {
    row.dataset.vhOriginalTransition = row.style.transition === '' ? EMPTY_SENTINEL : row.style.transition;
  }

  row.style.transition = 'background-color 0.3s ease';
  row.style.backgroundColor = '#fef08a';
  row.style.outline = '2px solid #eab308';

  const timerId = setTimeout(() => {
    activeTimers.delete(row);

    const rawBg = row.dataset.vhOriginalBg;
    const originalBackground = rawBg === EMPTY_SENTINEL ? '' : (rawBg ?? '');
    row.style.backgroundColor = originalBackground;
    row.style.outline = '';
    delete row.dataset.vhOriginalBg;

    const transTimerId = setTimeout(() => {
      activeTransitionTimers.delete(row);
      const rawTrans = row.dataset.vhOriginalTransition;
      const originalTransition = rawTrans === EMPTY_SENTINEL ? '' : (rawTrans ?? '');
      row.style.transition = originalTransition;
      delete row.dataset.vhOriginalTransition;
    }, 300);

    activeTransitionTimers.set(row, transTimerId);
  }, durationMs);

  activeTimers.set(row, timerId);
}
