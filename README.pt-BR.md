<div align="center">

<img src="public/icon.svg" width="88" alt="Ícone do PaperTrail" />

# PaperTrail

[English](README.md) · **Português**

Gerenciador de referências acadêmicas, mobile-first, inspirado no Zotero. Guarda seus textos, gera resumos a partir do conteúdo anexado e copia a referência em ABNT pronta para colar no trabalho.

![React](https://img.shields.io/badge/React_19-292524?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-292524?logo=typescript&logoColor=3178C6)
![Firebase](https://img.shields.io/badge/Firebase-292524?logo=firebase&logoColor=FFCA28)
![Vercel Blob](https://img.shields.io/badge/Vercel%20Blob-292524?logo=vercel&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_API-292524?logo=googlegemini&logoColor=8E75B2)
![Vercel](https://img.shields.io/badge/Vercel-292524?logo=vercel&logoColor=white)

</div>

Funciona como PWA: no iPhone (Safari → Compartilhar → Adicionar à Tela de Início) e no Android (Chrome → Instalar app).

## Funcionalidades

- **Adicionar textos** colando um DOI, ISBN, link ou arXiv (o app reconhece sozinho), arrastando um PDF para a janela ou preenchendo à mão, com revisão dos metadados antes de salvar. Dados do Crossref, Open Library e Google Books
- **Anexo em qualquer texto** (PDF, DOCX ou TXT até 20 MB), com extração do texto completo
- **Resumo por IA baseado no texto anexado**: parágrafo, pontos-chave e palavras-chave. Sem anexo, usa o resumo original (abstract) e indica isso; sem nenhum dos dois, não gera nada
- **Textos relacionados reais**: o Gemini gera termos de busca e os resultados vêm do [OpenAlex](https://openalex.org), sem referências inventadas
- **Copiar em ABNT (NBR 6023:2018)** com formatação feita por código, não por IA: referência completa, citação direta e indireta e autor no texto. Copia com negrito para Word e Google Docs
- **Referências da coleção** em ordem alfabética, prontas para a lista final
- **Apontamentos** em post-its, com página opcional e atalho para copiar a citação direta
- Coleções, tags, status de leitura, favoritos e busca sem acento por título, autor, resumo, DOI e apontamentos
- **Ações em lote**: mudar status, pôr em coleção, copiar a lista ABNT ou excluir vários textos
- **Importar do Zotero/Mendeley** (BibTeX ou RIS, pulando duplicados) e exportar em BibTeX, RIS ou JSON
- **Computador**: barra lateral, lista e texto aberto lado a lado, leitor de PDF embutido e atalhos de teclado (`?` mostra a lista)
- Sincronização entre aparelhos e uso offline

## Stack

| Parte | Tecnologia |
|---|---|
| Interface | React 19, TypeScript, Vite, Tailwind CSS 4, PWA (vite-plugin-pwa) |
| Login e dados | Firebase Authentication + Cloud Firestore (cache offline) |
| Anexos | Vercel Blob (store privado, links assinados) |
| IA | Gemini (`@google/genai`) com saída em JSON estruturado |
| Servidor | Funções serverless da Vercel em `/api` |

Todos os serviços usados cabem nos planos gratuitos, sem cartão.

## Arquitetura

```
Navegador (PWA)
 ├─ Firebase Auth ............ login (Google ou e-mail)
 ├─ Firestore ................ biblioteca, coleções, texto extraído
 ├─ Vercel Blob .............. envio direto do arquivo, liberado por /api/storage
 └─ /api (Vercel) ............ verifica o token do Firebase em toda chamada
     ├─ storage .............. gera tokens de envio e links temporários
     ├─ extract-text ......... PDF (unpdf), DOCX (mammoth), TXT; OCR via Gemini se o PDF for escaneado
     ├─ extract-metadata ..... metadados de URL ou PDF via Gemini
     ├─ summarize ............ resumo a partir do texto completo ou do abstract
     └─ search-terms ......... termos para a busca no OpenAlex
```

A chave do Gemini e o token do Blob ficam só no servidor. Com `ALLOWED_EMAILS` definida, só essas contas usam IA e anexos. Cada usuário tem um limite diário de chamadas de IA.

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

### Vercel Blob
1. No projeto da Vercel: **Storage → Create → Blob**, escolha acesso **Private** e conecte ao projeto
2. A variável `BLOB_READ_WRITE_TOKEN` é criada sozinha no projeto; copie para o `.env.local` para rodar local

### Gemini
Gere a chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

### Vercel
Importe o repositório, cadastre as variáveis do `.env.example` e publique. O `vercel.json` já configura as funções e as rotas do app.

## Licença

[MIT](LICENSE)
