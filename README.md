# PaperTrail

Gerenciador de referências acadêmicas, mobile-first, inspirado no Zotero. Guarda seus textos, gera resumos a partir do conteúdo anexado e copia a referência em ABNT pronta para colar no trabalho.

Funciona como PWA: no iPhone (Safari → Compartilhar → Adicionar à Tela de Início) e no Android (Chrome → Instalar app).

## Funcionalidades

- **Adicionar textos** por DOI (CrossRef), ISBN (Open Library), URL, PDF ou manualmente, com revisão dos metadados antes de salvar
- **Anexo em qualquer texto** (PDF, DOCX ou TXT até 20 MB), com extração do texto completo
- **Resumo por IA baseado no texto anexado**: parágrafo, pontos-chave e palavras-chave. Sem anexo, usa o resumo original (abstract) e indica isso; sem nenhum dos dois, não gera nada
- **Textos relacionados reais**: o Gemini gera termos de busca e os resultados vêm do [OpenAlex](https://openalex.org), sem referências inventadas
- **Copiar em ABNT (NBR 6023:2018)** com formatação feita por código, não por IA: referência completa, citação direta e indireta e autor no texto. Copia com negrito para Word e Google Docs
- **Referências da coleção** em ordem alfabética, prontas para a lista final
- **Apontamentos** em post-its, com página opcional e atalho para copiar a citação direta
- Coleções, tags, status de leitura, favoritos e busca
- Backup em JSON e exportação em BibTeX
- Sincronização entre aparelhos e uso offline

## Stack

| Parte | Tecnologia |
|---|---|
| Interface | React 19, TypeScript, Vite, Tailwind CSS 4, PWA (vite-plugin-pwa) |
| Login e dados | Firebase Authentication + Cloud Firestore (cache offline) |
| Anexos | Supabase Storage (bucket privado, links assinados) |
| IA | Gemini (`@google/genai`) com saída em JSON estruturado |
| Servidor | Funções serverless da Vercel em `/api` |

Todos os serviços usados cabem nos planos gratuitos, sem cartão.

## Arquitetura

```
Navegador (PWA)
 ├─ Firebase Auth ............ login (Google ou e-mail)
 ├─ Firestore ................ biblioteca, coleções, texto extraído
 ├─ Supabase Storage ......... envio direto do arquivo com token de uso único
 └─ /api (Vercel) ............ verifica o token do Firebase em toda chamada
     ├─ storage .............. gera tokens de envio e links temporários
     ├─ extract-text ......... PDF (unpdf), DOCX (mammoth), TXT; OCR via Gemini se o PDF for escaneado
     ├─ extract-metadata ..... metadados de URL ou PDF via Gemini
     ├─ summarize ............ resumo a partir do texto completo ou do abstract
     └─ search-terms ......... termos para a busca no OpenAlex
```

A chave do Gemini e a chave de serviço do Supabase ficam só no servidor. Cada usuário tem um limite diário de chamadas de IA.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev                  # http://localhost:3000
```

As rotas `/api` rodam dentro do servidor do Vite em desenvolvimento.

```bash
npm test       # testes da formatação ABNT
npm run lint   # checagem de tipos
npm run build
```

## Configuração dos serviços

### Firebase
1. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com) (plano Spark, gratuito)
2. **Authentication** → ative Google e E-mail/senha
3. **Firestore Database** → crie o banco e cole o conteúdo de `firestore.rules` na aba Regras
4. **Configurações do projeto** → adicione um app Web e copie os valores para as variáveis `VITE_FIREBASE_*`
5. Depois do deploy, adicione o domínio do app em Authentication → Settings → Authorized domains

### Supabase
1. Crie um projeto em [supabase.com](https://supabase.com) (plano Free)
2. **SQL Editor** → rode `supabase/setup.sql` para criar o bucket privado `attachments`
3. **Project Settings → API** → copie a URL, a `anon key` e a `service_role key`

### Gemini
Gere a chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

### Vercel
Importe o repositório, cadastre as variáveis do `.env.example` e publique. O `vercel.json` já configura as funções e as rotas do app.

## Licença

MIT
