# Sistema AI multiagente

Codice: [supabase/functions/_shared/agents.ts](../supabase/functions/_shared/agents.ts) (usato dalla Edge Function `ai-chat` e dal server locale `server/local-ai.ts`). Provider: Google Gemini; modello da `GEMINI_MODEL` (default `gemini-3.1-flash-lite`).

## Flusso di una domanda
1. **Instradamento** — il coordinatore riceve solo la domanda e sceglie 1–2 specialisti (risposta JSON).
2. **Dati necessari** — vengono letti solo le tabelle dei due specialisti scelti (`tablesFor`). In cloud con il token dell'utente (RLS); in locale è il browser a inviare solo quelle tabelle. I dati sono compattati (ultime 80 righe per tabella, campi inutili tolti, tetto 24.000 caratteri).
3. **Analisi** — ogni specialista produce note con tre blocchi: DATI VERIFICATI, IPOTESI, SUGGERIMENTI (in parallelo).
4. **Risposta unica** — il coordinatore unisce in JSON: `summary`, `verified[]`, `hypotheses[]`, `suggestions[]`, `see_vet`, `missing_data[]`. La UI mostra le tre categorie separate.

## Agenti
| id | Nome | Tabelle lette |
|---|---|---|
| veterinary | Veterinary Information | dogs, health_records, weights, appointments |
| nutrition | Nutrition Analyst | dogs, food_products, meals, weights, expenses |
| behavior | Behavior Analyst | dogs, behavior_logs, activities |
| wellness | Wellness Analyst | dogs, weights, activities, behavior_logs, meals |
| economist | Family Economist | expenses, budgets, food_products |
| organizer | Family Organizer | appointments, health_records, food_products |

## Regole comuni (nel prompt di sistema)
Solo dati forniti; se manca un dato lo dice; nessuna diagnosi, terapia, dosaggio o probabilità clinica; rimando al veterinario (urgenze: clinica H24); l'economista non suggerisce mai di ridurre cure necessarie.

## Estrazione da foto (OCR con AI)
`extractFromFile` per etichette alimentari, scontrini e documenti: restituisce **solo una proposta**; la UI apre il normale modulo precompilato e **nulla viene salvato senza conferma**. I campi non leggibili restano vuoti.

## Errori e limiti
Mappati in messaggi italiani: chiave assente → "AI non disponibile"; 429 → limite raggiunto; chiave non valida; modello non disponibile; timeout 45 s con un solo nuovo tentativo; contenuto bloccato. Limiti per utente (cloud): 10/minuto, 150/giorno. Mai risposte simulate.

## Analisi che NON usano l'AI
`src/lib/analysis.ts` (baseline: ultimi 7 giorni vs 28 precedenti, soglie e minimi di dati espliciti) e `reports.ts` sono calcoli deterministici e testati (`tests/analysis.test.ts`). Ogni segnalazione riporta: cosa è cambiato, rispetto a quale periodo, affidabilità, informazioni mancanti, approfondimento. Nessuna diagnosi.
