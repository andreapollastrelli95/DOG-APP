# Stato delle verifiche (24/11/2026)

Regola del progetto: una funzione è "verificata" solo se è stata provata davvero. Tutto il resto è dichiarato.

## Verificato (test automatici, Edge reale, Gemini reale)
Comando: `npm test` (22 test) e `npm run test:e2e` (55 controlli su Edge, modalità locale).

- Profilo (validazione, foto, "da completare" senza dati inventati), dashboard che si aggiorna da sola, scorciatoie rapide.
- CRUD con validazione, modifica, eliminazione con conferma (annulla non elimina), ricerca/filtri, cronologia modifiche con autore.
- Cartella clinica → PDF valido; CSV con `;` e BOM; report PDF.
- Archivio: upload, anteprima, download (file identico), eliminazione.
- Grafici (peso, pasti, attività, benessere, spese), ricorrenze di spesa, previsione.
- Analisi: variazione di energia/appetito/peso rispetto alla baseline (dati demo), con i 5 punti richiesti; nessuna segnalazione con pochi dati.
- Demo separata dai dati reali; uscita dalla demo lascia intatti i dati reali.
- Persistenza dopo ricarica; PWA: manifest, service worker, apertura offline dalla cache, registrazione offline salvata.
- Responsive 390 px / 820 px / 1280 px (nessuno scroll orizzontale), tema scuro.
- **AI reale (Gemini, modello gemini-3.1-flash-lite):** coordinatore → specialisti → risposta unica (verificato / ipotesi / suggerimenti / quando sentire il veterinario / dati mancanti); storico conversazioni; lettura scontrino da foto (importo 66,50 letto correttamente) con modulo di conferma e nulla salvato prima della conferma.
- Coda offline e sincronizzazione cloud contro un **Supabase simulato in memoria**: accodamento, ordine, ritrasmissione senza duplicati, accorpamento di creazione+modifica (bug di perdita dati trovato e corretto dal test), conflitti, rifiuto del server, coda che sopravvive al riavvio.

## Verificato sul cloud reale (24/11/2026) — app https://lilla-app.pages.dev
Comandi: `node tests/cloud-check.mjs` (14 controlli sul backend Supabase) e `node tests/e2e/cloud-live.mjs` (6 controlli su Edge contro l'app pubblicata). Usano utenti di prova creati e poi eliminati.
- Migrazione SQL eseguita su Supabase reale: 20 tabelle, tutte con RLS attiva.
- `create_household`, inserimento con `created_by` impostato dal trigger, audit log scritto dal trigger e non falsificabile dal client.
- RLS: un utente estraneo non vede, non scrive e non cancella i dati di un'altra famiglia; l'anonimo non vede nulla.
- Edge Function `ai-chat` distribuita: risponde con AI configurata, rifiuta chi non è loggato. `invite` distribuita: rifiuta un estraneo.
- App pubblicata su Cloudflare Pages: login reale, creazione famiglia, nessun errore JS.

## LILLA APP: tema, nome e album (25/11/2026)
- Tema lilla (chiaro predefinito), nome e icone aggiornati.
- Nuovo indirizzo `https://lilla-app.pages.dev` (progetto Pages `lilla-app`); il vecchio `dog-app.pages.dev` rimanda con un 301. Logo: impronta lilla scuro su lilla chiaro.
- Menu e Home riordinati: archivio/documenti, agenda, spese, analisi, luoghi, AI in primo piano; alimentazione, attività, benessere e registrazioni rapide in secondo piano.
- Album foto e video in Home, provato su Supabase reale (`tests/e2e/gallery-live.mjs`; con `VIDEO=file.mp4` prova anche la riproduzione): caricamento multiplo, Storage privato, frecce, griglia da 6, eliminazione anche del file, video riprodotto. Provato su Edge a 390 px, non su iPhone.
- Importate nell'album di famiglia 160 foto (convertite in JPEG 1600 px) e 20 video (H.264, lato lungo 960 px) dallo zip sul Desktop: circa 114 MB su 1 GB del piano gratuito.
- `npm test`: 21 su 22; il test con Gemini reale è andato in timeout (servizio lento).
- La suite locale `tests/e2e/smoke.mjs` non è stata rieseguita dopo le modifiche.

## NON verificato (scritto ma mai eseguito)
1. **Invio reale di un invito email** e accettazione da parte di un secondo utente (`invite` provata solo nel rifiuto dell'estraneo); `claim_invites`, `remove_member`, `delete_household_data`, `delete_my_account` come flusso completo.
2. **Registrazione con email di conferma, recupero password**: non provati (l'email gratuita di Supabase è limitata a poche all'ora).
3. **Domanda AI completa via cloud** (`ask`/`extract` con la funzione distribuita): provato solo lo stato; la logica condivisa è testata in locale con Gemini reale.
4. **Caricamento documenti in cloud** (Storage) e anteprima con URL firmati; Realtime.
5. **iPhone/Safari**: installazione PWA, notifiche, fotocamera. Mai provato su un telefono. Windows: provato solo su Edge.
6. **Notifiche push ad app chiusa**: NON implementate (servono VAPID + servizio push). Sono presenti promemoria in-app e notifiche del dispositivo mentre l'app è aperta.
7. **Sincronizzazione tra due dispositivi reali**: non provata.
8. **Aggiornamenti dell'app pubblicata**: il deploy è manuale (`npm run build` poi `wrangler pages deploy dist --project-name=lilla-app`), non collegato a GitHub.

## Non implementato / semplificato rispetto alla specifica
- Foto/video allegati direttamente ai singoli eventi di salute/benessere: si caricano nell'Archivio (categoria foto/video).
- "Percorso" della passeggiata è un campo testo, senza mappa/GPS.
- Report annuale: non include "ricordi principali" (non c'è un'estrazione automatica dei ricordi).
- Backup: esportazione JSON/CSV dei dati e download dei documenti uno a uno; nessun backup automatico dei file.
- Tabelle accorpate per evitare duplicati (documentato in docs/DATABASE.md): visite/vaccini/farmaci in `health_records`, walks+activities in `activities`, inventario in `food_products`, ricordi in `documents`, reminders nel campo dell'evento.
- Tema: segue le preferenze di sistema alla prima apertura, poi la scelta salvata.
- Il bundle JS è ~1,5 MB (458 kB gzip): nessun code-splitting.
- Latenza AI: 14 s – oltre 100 s a seconda del carico di Gemini (osservato); il timeout è 45 s per chiamata, con un tentativo di ripetizione.
