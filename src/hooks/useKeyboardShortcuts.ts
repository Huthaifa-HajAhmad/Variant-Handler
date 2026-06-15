/**
 * Variant Handler — useKeyboardShortcuts
 * Registers global Alt-key shortcuts for the sidepanel.
 *
 * Fixes applied:
 *  - The original useEffect had [classification, activeInput, microNote,
 *    batchQueue] as dependencies, causing the event listener to be torn
 *    down and re-registered on every queue change (implicit re-subscription
 *    on every keystroke).
 *  - Now uses a mutable ref pattern: the handlers object is stored in a ref
 *    that is refreshed via useLayoutEffect on every render, but the actual
 *    addEventListener/removeEventListener pair only fires once (empty deps).
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

interface ShortcutHandlers {
  onToggleSettings: () => void;
  onFocusNote: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  // Always holds the latest handlers without triggering a new event
  // listener registration.
  const handlersRef = useRef<ShortcutHandlers>(handlers);

  // useLayoutEffect runs synchronously after each render — the ref is
  // always up-to-date before the next event can fire.
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept when focus is inside a form field
      const el = document.activeElement;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      if (!e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          handlersRef.current.onToggleSettings();
          break;
        case 'n':
          e.preventDefault();
          handlersRef.current.onFocusNote();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Registered exactly once — handlers accessed via ref
}
