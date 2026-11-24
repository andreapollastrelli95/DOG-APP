# Piano di backup e ripristino

## Modalità locale / demo
- **Backup:** Impostazioni → "Backup completo (JSON)" (tutte le tabelle) + CSV per tabella. I documenti si scaricano dall'Archivio uno a uno (i file non sono nel JSON).
- **Frequenza consigliata:** una volta al mese e prima di cancellare i dati del browser o cambiare PC.
- **Rischio:** i dati stanno in IndexedDB del browser: cancellare i "dati del sito" li elimina.
- **Ripristino:** NON c'è ancora un pulsante "importa backup". Il JSON è leggibile e serve a recuperare i dati a mano; l'importazione è da implementare.

## Modalità cloud (Supabase)
- **Backup database:** il piano gratuito non include backup automatici scaricabili con garanzie; piano Pro: backup giornalieri. Consigliato in ogni caso un dump periodico:
  `supabase db dump --linked -f backup-YYYY-MM-DD.sql` (conservare fuori da Supabase, in luogo privato).
- **Backup file (Storage):** scaricare periodicamente il bucket `documents` (Dashboard → Storage, oppure `supabase storage` / script con service role, mai nel frontend).
- **Ripristino:** creare un progetto nuovo, eseguire `0001_init.sql`, poi ripristinare il dump dei soli dati (`psql ... < backup.sql`) e ricaricare i file nel bucket `documents` mantenendo i percorsi `<household_id>/<document_id>`.
- **Prova di ripristino:** da fare almeno una volta su un progetto di prova (non ancora eseguita).
- **Eliminazione dati:** Impostazioni → "Elimina tutti i dati" (admin) cancella tabelle e file della famiglia; "Elimina il mio account" rimuove l'utente (e la famiglia se è l'unico admin).
- **Segreti:** `GEMINI_API_KEY` e la service role key vanno custodite fuori dal repository; in caso di sospetta esposizione, ruotarle subito.
