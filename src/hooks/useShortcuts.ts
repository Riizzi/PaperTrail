import { useEffect, useRef } from 'react';

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

/** Campo de texto em foco: atalhos de uma tecla não podem disparar */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Atalhos de teclado globais. As chaves são `e.key` ('/', 'n', 'Escape', 'ArrowDown'...).
 * Escape funciona mesmo digitando; as outras teclas, não. Ctrl/Cmd/Alt são ignorados.
 */
export function useShortcuts(map: ShortcutMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (e.key !== 'Escape' && isTyping(e.target)) return;
      const handler = ref.current[e.key] || ref.current[e.key.toLowerCase()];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
