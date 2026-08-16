/**
 * Variant Handler — useKeyboardShortcuts
 * Registers global Alt-key and Esc shortcuts for the sidepanel.
 *
 * Uses a mutable ref pattern so handlers are always up to date without
 * re-subscribing listeners on every render.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

export interface ShortcutHandlers {
  onToggleSettings: () => void;
  onFocusInput: () => void;
  onSwitchTab?: (tabIndex: number) => void;
  onCloseModals?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef<ShortcutHandlers>(handlers);

  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes modals even if inside an input
      if (e.key === 'Escape') {
        handlersRef.current.onCloseModals?.();
        return;
      }

      // Do not intercept other shortcuts when focus is inside a form field
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
        case 'f':
        case 'n':
          e.preventDefault();
          handlersRef.current.onFocusInput();
          break;
        case '1':
          e.preventDefault();
          handlersRef.current.onSwitchTab?.(0);
          break;
        case '2':
          e.preventDefault();
          handlersRef.current.onSwitchTab?.(1);
          break;
        case '3':
          e.preventDefault();
          handlersRef.current.onSwitchTab?.(2);
          break;
        case '4':
          e.preventDefault();
          handlersRef.current.onSwitchTab?.(3);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
