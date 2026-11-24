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

## NON verificato (scritto ma mai eseguito)
1. **Supabase reale**: migrazione SQL, RLS, trigger di audit, funzioni (`create_household`, `claim_invites`, `remove_member`, `delete_household_data`, `delete_my_account`), bucket Storage, Realtime. Lo schema è stato scritto con cura ma non eseguito.
2. **Registrazione/login/recupero password/inviti email/revoca accessi** (dipendono da Supabase Auth e dalla funzione `invite`).
3. **Edge Functions** `ai-chat` e `invite` (mai distribuite). La logica condivisa `_shared/agents.ts` è invece testata (gira anche nel server locale).
4. **Caricamento documenti in cloud** (Storage) e anteprima con URL firmati.
5. **iPhone/Safari**: installazione PWA, notifiche, fotocamera. Mai provato su un telefono. Windows: provato solo su Edge.
6. **Pubblicazione Cloudflare Pages**: file pronti (`_redirects`, `_headers`), nessun deploy fatto; non esiste un indirizzo online.
7. **Notifiche push ad app chiusa**: NON implementate (servono VAPID + servizio push). Sono presenti promemoria in-app e notifiche del dispositivo mentre l'app è aperta.
8. **Sincronizzazione tra due dispositivi reali** (Realtime): non provata.

## Non implementato / semplificato rispetto alla specifica
- Foto/video allegati direttamente ai singoli eventi di salute/benessere: si caricano nell'Archivio (categoria foto/video).
- "Percorso" della passeggiata è un campo testo, senza mappa/GPS.
- Report annuale: non include "ricordi principali" (non c'è un'estrazione automatica dei ricordi).
- Backup: esportazione JSON/CSV dei dati e download dei documenti uno a uno; nessun backup automatico dei file.
- Tabelle accorpate per evitare duplicati (documentato in docs/DATABASE.md): visite/vaccini/farmaci in `health_records`, walks+activities in `activities`, inventario in `food_products`, ricordi in `documents`, reminders nel campo dell'evento.
- Tema: segue le preferenze di sistema alla prima apertura, poi la scelta salvata.
- Il bundle JS è ~1,5 MB (458 kB gzip): nessun code-splitting.
- Latenza AI: 14 s – oltre 100 s a seconda del carico di Gemini (osservato); il timeout è 45 s per chiamata, con un tentativo di ripetizione.
