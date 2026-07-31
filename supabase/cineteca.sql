-- ══════════════════════════════════════════════════════════
-- CINETECA — sincronizzazione dello stato personale
--
-- Da incollare in Supabase → SQL Editor → Run.
-- Tabella separata da quella del gym: le due app non si toccano.
--
-- Cosa ci finisce dentro: solo i TUOI dati personali per film
-- (visto, da rivedere, voto a stelle, quando l'hai toccato).
-- Il catalogo dei film NON sta qui: vive nel repository ed è
-- uguale per tutti.
-- ══════════════════════════════════════════════════════════

create table if not exists cineteca_states (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Ogni riga è di un solo utente, e nessuno può leggere quella degli altri.
alter table cineteca_states enable row level security;

drop policy if exists "leggo solo la mia riga"     on cineteca_states;
drop policy if exists "creo solo la mia riga"      on cineteca_states;
drop policy if exists "aggiorno solo la mia riga"  on cineteca_states;
drop policy if exists "cancello solo la mia riga"  on cineteca_states;

create policy "leggo solo la mia riga"
  on cineteca_states for select
  using (auth.uid() = user_id);

create policy "creo solo la mia riga"
  on cineteca_states for insert
  with check (auth.uid() = user_id);

create policy "aggiorno solo la mia riga"
  on cineteca_states for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "cancello solo la mia riga"
  on cineteca_states for delete
  using (auth.uid() = user_id);

-- Tiene aggiornato updated_at senza doverlo scrivere dal client.
create or replace function cineteca_tocca()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists cineteca_tocca_trigger on cineteca_states;
create trigger cineteca_tocca_trigger
  before update on cineteca_states
  for each row execute function cineteca_tocca();
