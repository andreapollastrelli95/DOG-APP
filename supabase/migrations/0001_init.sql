-- DOG MANAGER — schema iniziale. Eseguire con `supabase db push` o incollare nel SQL Editor.
-- Principio: ogni riga appartiene a un household; Row Level Security consente l'accesso solo ai membri.
-- NOTA: questo script NON è stato eseguito su un database reale in fase di sviluppo (vedi docs/STATO_VERIFICHE).

create extension if not exists pgcrypto;

-- ============ Famiglie e utenti ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index on public.household_members (user_id);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (household_id, email)
);

-- helper RLS (security definer: evita ricorsione nelle policy)
create or replace function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid());
$$;
create or replace function public.is_admin(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid() and role = 'admin');
$$;

-- ============ Tabelle dati ============
-- Colonne comuni: id, household_id, created_at, updated_at, created_by
create table public.dogs (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  breed text, birth_date date, sex text check (sex in ('F', 'M')),
  size text check (size in ('media', 'grande', 'gigante')),
  coat text, microchip text, registration_number text, adoption_date date,
  sterilized boolean not null default false,
  vet_name text, vet_phone text, emergency_contacts text, allergies text, conditions text, notes text,
  activity_goal_min int check (activity_goal_min between 0 and 600),
  photo_data text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

create table public.weights (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  date date not null, weight_kg numeric(5,2) not null check (weight_kg between 0.1 and 120), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

-- visite, vaccinazioni, richiami, antiparassitari, farmaci, esami, interventi, allergie, patologie, osservazioni
create table public.health_records (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('visita','vaccinazione','richiamo','antiparassitario','farmaco','esame','analisi_sangue','referto','intervento','allergia','patologia','osservazione')),
  title text not null, description text, vet_name text, dosage text, next_due_date date,
  cost_eur numeric(10,2) check (cost_eur >= 0), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

-- prodotti alimentari + scorte (food_products e food_inventory unificati: una sola riga per prodotto)
create table public.food_products (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  brand text, name text not null, type text not null check (type in ('secco','umido','casalingo','barf','snack','integratore','altro')),
  daily_grams numeric(8,1) check (daily_grams >= 0), stock_grams numeric(10,1) check (stock_grams >= 0),
  purchase_date date, cost_eur numeric(10,2) check (cost_eur >= 0), avoid boolean not null default false, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

create table public.meals (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  at timestamptz not null, kind text not null check (kind in ('pasto','snack','integratore')),
  food_name text, grams numeric(8,1) check (grams >= 0), appetite int check (appetite between 1 and 5), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

-- passeggiate, giochi, esercizio, riposo (walks e activities unificati)
create table public.activities (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  at timestamptz not null, kind text not null check (kind in ('passeggiata','gioco','esercizio','riposo')),
  duration_min int not null check (duration_min between 1 and 1440), distance_km numeric(6,2) check (distance_km between 0 and 200),
  route text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

create table public.behavior_logs (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  mood int check (mood between 1 and 5), appetite int check (appetite between 1 and 5), energy int check (energy between 1 and 5),
  sleep int check (sleep between 1 and 5), sociality int check (sociality between 1 and 5),
  unusual text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

create table public.expenses (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  category text not null check (category in ('alimentazione','veterinario','farmaci','antiparassitari','toelettatura','accessori','giochi','pensione_dogsitter','assicurazione','altro')),
  description text not null, amount_eur numeric(10,2) not null check (amount_eur > 0),
  recurring text check (recurring in ('mensile','trimestrale','annuale')), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

create table public.budgets (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  period text not null check (period in ('mensile','annuale')), category text, amount_eur numeric(10,2) not null check (amount_eur > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

-- agenda + promemoria (reminders unificati nell'evento: remind_before_min)
create table public.appointments (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  starts_at timestamptz not null,
  kind text not null check (kind in ('visita','vaccinazione','trattamento','toelettatura','acquisto','scadenza','famiglia','pasto','passeggiata')),
  title text not null, description text, assignee text, priority text check (priority in ('bassa','normale','alta')),
  remind_before_min int check (remind_before_min >= 0), done boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

create table public.places (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('veterinario','clinica_h24','farmacia','toelettatore','dog_sitter','pensione','area_cani','negozio','altro')),
  name text not null, phone text, address text, hours text, website text, emergency boolean not null default false, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

-- documenti e ricordi (dog_documents + memories unificati: categoria 'ricordo'/'foto'/'video')
create table public.documents (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  title text not null, category text not null check (category in ('referto','vaccinazione','certificato','fattura','scontrino','identificativo','foto','video','ricordo','altro')),
  date date, tags text[] not null default '{}', notes text,
  file_name text, mime text, size_bytes bigint check (size_bytes <= 26214400), storage_path text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create index on public.documents using gin (tags);

create table public.notifications (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade, title text not null, body text, read boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

create table public.ai_conversations (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
-- ai_messages contiene anche il risultato strutturato delle analisi (ai_analysis unificata: colonna "result")
create table public.ai_messages (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')), content text not null, result jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users(id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  user_id uuid, user_name text, action text not null, table_name text not null, row_id uuid, summary text,
  created_at timestamptz not null default now()
);

-- ============ Indici ============
create index on public.weights (household_id, date desc);
create index on public.health_records (household_id, date desc);
create index on public.health_records (household_id, next_due_date) where next_due_date is not null;
create index on public.meals (household_id, at desc);
create index on public.activities (household_id, at desc);
create index on public.behavior_logs (household_id, date desc);
create index on public.expenses (household_id, date desc);
create index on public.appointments (household_id, starts_at);
create index on public.documents (household_id, date desc);
create index on public.ai_messages (conversation_id, created_at);
create index on public.audit_logs (household_id, created_at desc);
create index on public.food_products (household_id);
create index on public.places (household_id);
create index on public.budgets (household_id);
create index on public.ai_conversations (household_id, updated_at desc);
create index on public.notifications (household_id, user_id);
create index on public.dogs (household_id);

-- ============ Trigger: updated_at, created_by forzato, audit ============
create or replace function public.tg_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;

create or replace function public.tg_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; nm text; summ text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  select coalesce(display_name, email) into nm from profiles where id = auth.uid();
  summ := coalesce(to_jsonb(r)->>'title', to_jsonb(r)->>'name', to_jsonb(r)->>'description', to_jsonb(r)->>'food_name', tg_table_name);
  insert into audit_logs (household_id, user_id, user_name, action, table_name, row_id, summary)
  values (r.household_id, auth.uid(), nm, lower(tg_op), tg_table_name, r.id, summ);
  return r;
end $$;

do $$
declare t text;
begin
  foreach t in array array['dogs','weights','health_records','food_products','meals','activities','behavior_logs','expenses','budgets','appointments','places','documents','notifications','ai_conversations','ai_messages']
  loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.tg_touch()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy member_select on public.%I for select using (public.is_member(household_id))', t);
    execute format('create policy member_insert on public.%I for insert with check (public.is_member(household_id))', t);
    execute format('create policy member_update on public.%I for update using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
    execute format('create policy member_delete on public.%I for delete using (public.is_member(household_id))', t);
  end loop;
  -- audit su tutte tranne messaggi AI/notifiche (rumorose)
  foreach t in array array['dogs','weights','health_records','food_products','meals','activities','behavior_logs','expenses','budgets','appointments','places','documents']
  loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.tg_audit()', t);
  end loop;
end $$;

-- audit_logs: sola lettura per i membri; nessuna scrittura dal client
alter table public.audit_logs enable row level security;
create policy audit_select on public.audit_logs for select using (public.is_member(household_id));

-- ============ RLS: profili, famiglie, membri, inviti ============
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or exists (select 1 from household_members a join household_members b on a.household_id = b.household_id where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.households enable row level security;
create policy households_select on public.households for select using (public.is_member(id));
create policy households_update on public.households for update using (public.is_admin(id)) with check (public.is_admin(id));

alter table public.household_members enable row level security;
create policy members_select on public.household_members for select using (public.is_member(household_id));
-- inserimenti/rimozioni solo tramite funzioni sicure sotto

alter table public.household_invites enable row level security;
create policy invites_select on public.household_invites for select using (public.is_admin(household_id));
create policy invites_delete on public.household_invites for delete using (public.is_admin(household_id));

-- ============ Funzioni applicative ============
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'Non autenticato'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then raise exception 'Fai già parte di una famiglia'; end if;
  insert into households (name, created_by) values (trim(p_name), auth.uid()) returning id into h;
  insert into household_members (household_id, user_id, role) values (h, auth.uid(), 'admin');
  return h;
end $$;

-- collega gli inviti pendenti all'email dell'utente autenticato
create or replace function public.claim_invites() returns void
language plpgsql security definer set search_path = public as $$
declare mail text;
begin
  select email into mail from auth.users where id = auth.uid();
  if mail is null then return; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then return; end if;
  insert into household_members (household_id, user_id, role)
    select household_id, auth.uid(), role from household_invites where lower(email) = lower(mail) order by created_at limit 1;
  delete from household_invites where lower(email) = lower(mail);
end $$;

create or replace function public.remove_member(p_household uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_household) then raise exception 'Solo un amministratore può revocare accessi'; end if;
  if p_user = auth.uid() then raise exception 'Non puoi revocare te stesso'; end if;
  delete from household_members where household_id = p_household and user_id = p_user;
end $$;

create or replace function public.delete_household_data(p_household uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not is_admin(p_household) then raise exception 'Solo un amministratore può eliminare i dati'; end if;
  foreach t in array array['ai_messages','ai_conversations','notifications','documents','places','appointments','budgets','expenses','behavior_logs','activities','meals','food_products','health_records','weights','dogs','audit_logs']
  loop execute format('delete from public.%I where household_id = $1', t) using p_household; end loop;
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare h record;
begin
  -- se sei l'unico amministratore, elimina l'intera famiglia
  for h in select household_id from household_members where user_id = auth.uid() and role = 'admin' loop
    if not exists (select 1 from household_members where household_id = h.household_id and role = 'admin' and user_id <> auth.uid()) then
      delete from households where id = h.household_id;
    end if;
  end loop;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.create_household(text), public.claim_invites(), public.remove_member(uuid, uuid), public.delete_household_data(uuid), public.delete_my_account() from public, anon;
grant execute on function public.create_household(text), public.claim_invites(), public.remove_member(uuid, uuid), public.delete_household_data(uuid), public.delete_my_account() to authenticated;

-- ============ Storage privato per i documenti ============
insert into storage.buckets (id, name, public, file_size_limit) values ('documents', 'documents', false, 26214400) on conflict (id) do nothing;
-- i file stanno in <household_id>/<document_id>
create policy docs_select on storage.objects for select using (bucket_id = 'documents' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy docs_insert on storage.objects for insert with check (bucket_id = 'documents' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy docs_delete on storage.objects for delete using (bucket_id = 'documents' and public.is_member(((storage.foldername(name))[1])::uuid));

-- ============ Realtime ============
alter publication supabase_realtime add table public.weights, public.meals, public.activities, public.behavior_logs, public.expenses, public.appointments, public.health_records, public.documents, public.dogs, public.food_products, public.places, public.budgets;
