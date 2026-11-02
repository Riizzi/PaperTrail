import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import './index.css';

// /cartinha é a página de escrever (sem login); o resto é o app
const isLetterPage = window.location.pathname.replace(/\/+$/, '') === '/cartinha';
const Page = isLetterPage
  ? lazy(() => import('./components/LetterWriter').then((m) => ({ default: m.LetterWriter })))
  : lazy(() => import('./App.tsx'));

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={null}>
    <Page />
  </Suspense>
);
