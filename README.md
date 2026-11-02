<div align="center">

<img src="public/icon.svg" width="88" alt="PaperTrail icon" />

# PaperTrail

**English** · [Português](README.pt-BR.md)

A mobile-first academic reference manager inspired by Zotero. It stores your readings, summarizes them from the attached full text, and copies the reference in ABNT format (the Brazilian citation standard), ready to paste into your paper.

![React](https://img.shields.io/badge/React_19-292524?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-292524?logo=typescript&logoColor=3178C6)
![Firebase](https://img.shields.io/badge/Firebase-292524?logo=firebase&logoColor=FFCA28)
![Vercel Blob](https://img.shields.io/badge/Vercel%20Blob-292524?logo=vercel&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_API-292524?logo=googlegemini&logoColor=8E75B2)
![Vercel](https://img.shields.io/badge/Vercel-292524?logo=vercel&logoColor=white)

</div>

Installable as a PWA on iPhone (Safari → Share → Add to Home Screen) and Android (Chrome → Install app).

> The app interface is in Brazilian Portuguese.

## Features

- **Add readings** by pasting a DOI, ISBN, link or arXiv ID (detected automatically), dropping a PDF on the window, or filling in by hand, with a metadata review step before saving. Data from Crossref, Open Library and Google Books
- **Attach files to any reading** (PDF, DOCX or TXT up to 20 MB) with full-text extraction
- **AI summaries grounded in the attached text**: paragraph, key points and keywords. Without an attachment it falls back to the original abstract and says so; with neither, it generates nothing
- **Real related readings**: Gemini only produces search terms, and results come from [OpenAlex](https://openalex.org), so no invented references
- **Copy in ABNT (NBR 6023:2018)**, formatted by code rather than by AI: full reference, direct and indirect citations, and author-in-text. Copies with bold formatting for Word and Google Docs
- **Collection bibliography** in alphabetical order, ready for the final reference list
- **Sticky notes** with optional page number and a shortcut to copy the direct citation
- Collections, tags, reading status, favorites and accent-insensitive search across title, authors, abstract, DOI and notes
- **Bulk actions**: change status, add to a collection, copy the ABNT list or delete several readings
- **Import from Zotero/Mendeley** (BibTeX or RIS, skipping duplicates) and export to BibTeX, RIS or JSON
- **Desktop layout**: sidebar, list and open reading side by side, built-in PDF reader and keyboard shortcuts (`?` shows them)
- **Cartinhas** (little notes): a secret link (/cartinha) lets someone leave messages without an account; they show up as sticky notes in the app
- Multi-device sync and offline use

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 19, TypeScript, Vite, Tailwind CSS 4, PWA (vite-plugin-pwa) |
| Auth & data | Firebase Authentication + Cloud Firestore (offline cache) |
| Attachments | Vercel Blob (private store, signed URLs) |
| AI | Gemini (`@google/genai`) with structured JSON output |
| Backend | Vercel serverless functions in `/api` |

Every service fits in a free tier, with no credit card required.

## Architecture

```
Browser (PWA)
 ├─ Firebase Auth ............ sign-in (Google or email)
 ├─ Firestore ................ library, collections, extracted text
 ├─ Vercel Blob .............. direct upload, authorized by /api/storage
 └─ /api (Vercel) ............ verifies the Firebase ID token on every call
     ├─ storage .............. issues upload tokens and short-lived download links
     ├─ extract-text ......... PDF (unpdf), DOCX (mammoth), TXT; Gemini OCR for scanned PDFs
     ├─ extract-metadata ..... metadata from a URL or PDF via Gemini
     ├─ summarize ............ summary from the full text or the abstract
     └─ search-terms ......... terms for the OpenAlex search
```

The Gemini key and the Blob token live only on the server. With `ALLOWED_EMAILS` set, only those accounts can use AI and attachments. Each user has a daily AI call limit, and Gemini calls retry and fall back to other Flash models when one is overloaded.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the variables
npm run dev                  # http://localhost:3000
```

In development, the `/api` routes run inside the Vite dev server.

```bash
npm test       # ABNT formatting tests
npm run lint   # type check
npm run build
```

## Service setup

### Firebase
1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) (free Spark plan)
2. **Authentication** → enable Google and Email/Password
3. **Firestore Database** → create the database and paste `firestore.rules` into the Rules tab
4. **Project settings** → add a Web app and copy its values into the `VITE_FIREBASE_*` variables
5. After deploying, add the app's domain under Authentication → Settings → Authorized domains

### Vercel Blob
1. In the Vercel project: **Storage → Create → Blob**, choose **Private** access and connect it to the project
2. `BLOB_READ_WRITE_TOKEN` is added to the project automatically; copy it into `.env.local` for local development

### Gemini
Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

### Vercel
Import the repository, add the variables from `.env.example` and deploy. `vercel.json` already configures the functions and app routes.

## License

[MIT](LICENSE)
