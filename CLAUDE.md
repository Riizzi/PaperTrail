# PaperTrail — guia para o Claude

Gerenciador de referências acadêmicas (tipo Zotero), mobile-first, PWA. Autor: João Pedro Rizzi.
Repositório: github.com/Riizzi/PaperTrail · Deploy: Vercel · Idioma da interface e dos commits: português.

## Comandos

```bash
npm install
cp .env.example .env.local   # preencher as chaves (ver README)
npm run dev                  # http://localhost:3000 — front e /api juntos
npm test                     # testes (ABNT, detecção, BibTeX/RIS, busca)
npm run lint                 # tsc --noEmit
npm run build
```

Antes de dar uma tarefa por concluída: `npm test && npm run lint && npm run build`.

## Arquitetura

- `src/` — front (React 19 + TS + Vite + Tailwind 4). Sem roteador: `App.tsx` controla as abas
  (`library`, coleções, busca, conta), os atalhos (`hooks/useShortcuts.ts`), colar/arrastar e o modo seleção.
  Layout: ≥ 1024 px tem `Sidebar` + lista + `ItemDetailModal variant="panel"`; abaixo disso, `Navigation` embaixo
  e o detalhe em tela cheia (`variant="modal"`). `AddModal` e `ItemDetailModal` são carregados com lazy.
  `ItemEditForm` salva só os campos editados sobre o texto atual (nunca uma cópia antiga inteira).
- `src/types.ts` — modelo de dados. `ReferenceItem` é o texto cadastrado; `Collection` é a coleção.
  Ao criar um campo novo, adicione aqui e confira `firestore.rules` (título ≤ 500, nome de coleção ≤ 150).
- `src/services/`
  - `firebase.ts` — login e CRUD no Firestore (`users/{uid}/items`, `users/{uid}/collections`,
    texto completo em `users/{uid}/items/{id}/content`). Use `cleanUndefined` antes de gravar: o Firestore recusa `undefined`.
  - `api.ts` — chamadas às rotas `/api`, sempre com o token do Firebase (`getAuthHeader`).
  - `attachments.ts` — envio do anexo direto ao Vercel Blob (store privado); `/api/storage` libera o envio (`handleUpload`) e gera link assinado para abrir.
  - `abnt.ts` — formatação ABNT NBR 6023:2018 **por código** (referência, citações, lista da coleção, BibTeX). Coberto por testes; mexeu aqui, rode `npm test` e adicione caso de teste.
  - `crossref.ts` (DOI), `openlibrary.ts` (ISBN, com Google Books de reserva), `openalex.ts` (textos relacionados) —
    APIs públicas chamadas do navegador via `http.ts` (`fetchJson` com prazo e nova tentativa).
  - `detect.ts` (o que foi colado: DOI/ISBN/arXiv/link), `bibio.ts` (BibTeX/RIS), `search.ts` (busca com pontuação). Todos com testes.
  - Textos relacionados: os termos da IA ficam em `item.relatedTerms` para não gastar cota a cada abertura.
  - `cl4pLink.ts` + `cl4pPaper.ts` — envio de um resumo da biblioteca para o hub pessoal CL4P-RZ (só quando vinculado).
    `cl4pLink.ts` é igual nos outros apps (RetroFin, SmartPantry etc.); mudanças nele devem valer para todos.
- `api/` — funções serverless da Vercel (em dev rodam dentro do Vite, ver `apiDevPlugin` em `vite.config.ts`).
  **Rota nova precisa ser registrada em `apiRoutes` no `vite.config.ts`**, senão dá 404 local.
  - `_lib/server.ts` — `generate()` (Gemini com retentativa, modelos reserva e prazo de 90 s),
    `requireUser()` (valida token, `ALLOWED_EMAILS` e limite diário de IA, em memória), funções do Blob (`putAttachment`, `downloadAttachment`, `signedAttachmentUrl`), `isOwnPath()`.
  - `_lib/metadata.ts` — leitura de metadados de PDF/URL sem IA.
  - `summarize`, `search-terms`, `extract-text`, `extract-metadata`, `storage`.
- `scripts/migrate-supabase-to-blob.mjs` — migração única dos anexos antigos do Supabase (mesmos caminhos).

## Regras do projeto

- Identidade visual "Retro Ledger": fundo #FAF7F2, cards #FFFDF9, texto #292524, bordas #E8DFD1,
  Plus Jakarta Sans + Space Mono, sombra sólida `2px 2px 0 #E5DCD0`, tags em aba de pasta, botão com efeito de pressionado.
- Sem linguagem promocional dentro do app.
- Chaves secretas (`GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN`) só no servidor; nunca com prefixo `VITE_`.
- Toda rota de `/api` começa com `requireUser` (use `countQuota: true` se chamar a IA) e valida caminhos com `isOwnPath`.
- A IA não inventa referências: textos relacionados vêm do OpenAlex; ABNT é feita por código.
- Resumo só a partir do texto anexado ou do abstract; sem nenhum dos dois, não gera.
- Ícone: quadrado arredondado cinza com símbolo preto monocromático (`public/icon.svg`, `scripts/generate-icons.js`).
