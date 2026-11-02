import { useEffect, useState } from 'react';

/** true enquanto a media query casar (ex.: '(min-width: 1024px)') */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Layout de computador: barra lateral + lista + painel de detalhe */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
