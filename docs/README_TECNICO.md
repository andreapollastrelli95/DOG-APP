# LILLA APP

Fascicolo digitale per la vita di una cagnolina, condiviso in famiglia. PWA in italiano (date `gg/mm/aaaa`, EUR, fuso Europe/Rome), installabile su iPhone e Windows.

> **Stato onesto:** l'app gira ed è collaudata in **modalità locale** (dati sul dispositivo) e **demo**. La parte **cloud/multiutente (Supabase)** è scritta ma **non è mai stata eseguita su un vero progetto Supabase**. Vedi [docs/STATO_VERIFICHE.md](docs/STATO_VERIFICHE.md) per l'elenco preciso di cosa è verificato e cosa no.

## Stack
React 19 · TypeScript · Vite 7 · Tailwind 4 · Recharts · jsPDF · Supabase (Postgres + Auth + Storage + RLS + Edge Functions) · Gemini API (solo lato server) · PWA con service worker · Cloudflare Pages.

## Tre modalità, un'unica interfaccia
| Modalità | Quando | Dove stanno i dati |
|---|---|---|
| **demo** | "Prova la demo" | archivio IndexedDB separato `dm-demo`, dati di esempio marcati "(ESEMPIO)" |
| **locale** | `VITE_SUPABASE_*` non impostate | IndexedDB `dm-local`, solo su questo dispositivo |
| **cloud** | `VITE_SUPABASE_*` impostate | Supabase con RLS + cache locale + coda offline |

Le pagine leggono sempre dal livello dati [src/lib/store.ts](src/lib/store.ts): in cloud scrive prima in locale (non si perde nulla), poi invia; la coda sopravvive al riavvio, accorpa le modifiche, rileva i conflitti (vince il server, il conflitto è mostrato).

## Comandi
```
npm install
npm run dev          # sviluppo (http://localhost:5173)
npm run build && npm start   # versione "di produzione" su http://localhost:4173 (serve per PWA/offline)
npm test             # test unitari (analisi, validazione, sincronizzazione offline, agenti; AI dal vivo se c'è GEMINI_API_KEY)
npm run test:e2e     # collaudo su Edge reale (richiede `npm start` attivo)
```
Su PC con Smart App Control il binario nativo di Rollup è bloccato: `package.json` usa l'override `rollup → @rollup/wasm-node`.

## Struttura
```
src/lib/schema.ts      definizione tabelle, validazione, normalizzazione (unica fonte per form/CSV)
src/lib/store.ts       livello dati: locale/demo/cloud, coda offline, conflitti, audit
src/lib/analysis.ts    baseline individuale e segnalazioni (nessuna AI, nessuna diagnosi)
src/lib/reports.ts     report settimanale/mensile/annuale
src/lib/ai.ts          client AI (nessuna chiave nel browser)
src/components/        UI, form/tabella generici (Resource.tsx), grafici
src/pages/             Dashboard, Profilo, moduli, Archivio, Chat AI, Analisi, Impostazioni, Auth
supabase/migrations/   schema SQL con RLS, trigger di audit, funzioni
supabase/functions/    ai-chat (Gemini), invite (inviti email), _shared/agents.ts (coordinatore + 6 agenti)
server/local-ai.ts     server AI locale (dev/preview) con la chiave letta dall'ambiente del PC
```

## Sicurezza (in breve)
- Nessuna chiave nel frontend o nel repository; `GEMINI_API_KEY` è un segreto del server.
- RLS su ogni tabella: accesso solo ai membri della famiglia; `created_by` e audit scritti da trigger (non falsificabili); bucket `documents` privato.
- L'AI legge i dati con il token dell'utente (quindi con RLS) e solo le tabelle necessarie alla domanda.
- Limiti d'uso AI: 10 richieste/minuto e 150/giorno per utente (cloud), 30/minuto (locale); timeout 45 s per chiamata.

Documentazione: [INSTALLAZIONE.txt](INSTALLAZIONE.txt) · [CONFIGURAZIONE.txt](CONFIGURAZIONE.txt) · [GUIDA_FAMIGLIA.txt](GUIDA_FAMIGLIA.txt) · [docs/DATABASE.md](docs/DATABASE.md) · [docs/AGENTI_AI.md](docs/AGENTI_AI.md) · [docs/BACKUP_RIPRISTINO.md](docs/BACKUP_RIPRISTINO.md)
