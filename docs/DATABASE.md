# Database

Sorgente: [supabase/migrations/0001_init.sql](../supabase/migrations/0001_init.sql). Le stesse tabelle esistono come object store IndexedDB in modalità locale/demo/cache.
**Non eseguito su un Supabase reale** (vedi STATO_VERIFICHE.md).

## Modello
```
auth.users 1─1 profiles
households 1─N household_members N─1 auth.users      (ruolo: admin | member)
households 1─N household_invites                      (email invitata, collegata da claim_invites())
households 1─N { dogs, weights, health_records, food_products, meals, activities,
                 behavior_logs, expenses, budgets, appointments, places, documents,
                 notifications, ai_conversations, audit_logs }
ai_conversations 1─N ai_messages
```
Ogni tabella dati ha: `id` (uuid generato dal client, così l'inserimento offline è idempotente), `household_id`, `created_at`, `updated_at`, `created_by`.

## Scelte per evitare tabelle duplicate (rispetto all'elenco della specifica)
| Specifica | Realizzato come |
|---|---|
| vaccinations, medications, veterinary_visits | `health_records.kind` (visita, vaccinazione, richiamo, antiparassitario, farmaco, esame, …) |
| walks + activities | `activities.kind` (passeggiata, gioco, esercizio, riposo) |
| food_inventory | colonne `stock_grams`, `daily_grams`, `purchase_date` in `food_products` |
| dog_documents + memories | `documents.category` (… foto, video, ricordo) |
| reminders | `appointments.remind_before_min` |
| ai_analysis | `ai_messages.result` (jsonb con la risposta strutturata e gli specialisti usati) |

## Validazione
CHECK sul database (intervalli, enum, importi > 0, dimensione file ≤ 25 MB) e la stessa validazione in `src/lib/schema.ts` per i form.

## Sicurezza (RLS)
- `is_member(h)` / `is_admin(h)` sono `security definer` (evitano ricorsioni nelle policy).
- Tabelle dati: select/insert/update/delete solo se `is_member(household_id)`.
- `created_by` e `updated_at` impostati dal trigger `tg_touch` (il client non può falsificarli).
- `audit_logs`: scritta dal trigger `tg_audit` (security definer), **sola lettura** per i membri.
- `households`: update solo admin; `household_members`: nessuna scrittura diretta, solo funzioni `create_household`, `claim_invites`, `remove_member`.
- Storage: bucket `documents` privato; percorso `<household_id>/<document_id>`; policy per membro; URL firmati a scadenza (5 min).
- Funzioni sensibili: `execute` revocato a `anon`, concesso ad `authenticated`.

## Indici
Per `(household_id, data desc)` su pesi, visite, pasti, attività, benessere, spese, documenti; `starts_at` agenda; GIN sui tag; `next_due_date` parziale; messaggi per conversazione.
