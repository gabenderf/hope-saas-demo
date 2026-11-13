import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/index.css';
import { App } from './app/App';

// O zod 4 testa `new Function` na partida para compilar validadores. A CSP da
// nuvem (script-src 'self', sem 'unsafe-eval') bloqueia isso e registraria uma
// violação a cada carga. Sem JIT, a validação é a mesma, só um pouco mais lenta.
z.config({ jitless: true });

const root = document.getElementById('root');
if (!root) throw new Error('#root não encontrado');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
