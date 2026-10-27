begin;

-- =====================================================================
-- Banco 1 — avisos (comunicados) no banco de dados
-- * Diretoria publica para todos, para uma supervisão ou para uma pessoa.
-- * Supervisor publica para todos, para a própria supervisão ou para alguém da equipe.
-- * Cada pessoa vê só os avisos destinados a ela (RLS) e pode ocultá-los para si.
-- * Excluir: diretoria (qualquer aviso) ou o autor.
-- Pré-requisito: 20261027120000_banco1_time_entries.sql aplicada.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

do $$
begin
  if to_regclass('public.teams') is null then
    raise exception 'Aplique antes a migration 20261027120000_banco1_time_entries.sql.';
  end if;
end;
$$;

create table if not exists public.banco1_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  message text not null check (length(btrim(message)) between 1 and 4000),
  urgency text not null default 'info' check (urgency in ('info', 'alerta', 'urgente')),
  recipient_type text not null default 'all' check (recipient_type in ('all', 'team', 'individual')),
  team_id uuid references public.teams(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default '',
  created_at timestamptz not null default now(),
  constraint banco1_announcements_target check (
    (recipient_type = 'all' and team_id is null and recipient_id is null)
    or (recipient_type = 'team' and team_id is not null and recipient_id is null)
    or (recipient_type = 'individual' and recipient_id is not null and team_id is null)
  )
);

create index if not exists banco1_announcements_created_idx on public.banco1_announcements (created_at desc);
create index if not exists banco1_announcements_team_idx on public.banco1_announcements (team_id) where team_id is not null;
create index if not exists banco1_announcements_recipient_idx on public.banco1_announcements (recipient_id) where recipient_id is not null;

create table if not exists public.banco1_announcement_hidden (
  announcement_id uuid not null references public.banco1_announcements(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

comment on table public.banco1_announcements is 'Avisos do Banco 1. Visibilidade por RLS (todos, supervisão ou pessoa).';
comment on table public.banco1_announcement_hidden is 'Avisos que cada pessoa ocultou para si.';

-- Autor e data sempre definidos pelo banco (nome do perfil de quem publica).
create or replace function private.banco1_announcements_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := auth.uid();
  new.created_at := now();
  select coalesce(nullif(btrim(p.full_name), ''), p.email, 'Gestão')
    into new.author_name
  from public.profiles as p where p.id = auth.uid();
  new.author_name := coalesce(new.author_name, 'Gestão');
  return new;
end;
$$;

drop trigger if exists banco1_announcements_stamp on public.banco1_announcements;
create trigger banco1_announcements_stamp
before insert on public.banco1_announcements
for each row execute function private.banco1_announcements_stamp();

-- O aviso é destinado ao usuário logado (ou ele é autor/gestor dele)?
create or replace function private.banco1_can_see_announcement(
  a_recipient_type text, a_team_id uuid, a_recipient_id uuid, a_author_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.module_role('BANCO_1') is null then false
    when private.module_role('BANCO_1') = 'diretor' then true
    when a_author_id = auth.uid() then true
    when a_recipient_type = 'all' then true
    when a_recipient_type = 'team' then private.is_active_team_member(a_team_id) or private.is_team_supervisor(a_team_id)
    when a_recipient_type = 'individual' then a_recipient_id = auth.uid() or private.supervises(a_recipient_id, 'BANCO_1')
    else false
  end
$$;

-- Pode publicar para esse destino?
create or replace function private.banco1_can_publish_announcement(
  a_recipient_type text, a_team_id uuid, a_recipient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.module_role('BANCO_1')
    when 'diretor' then true
    when 'supervisor' then
      a_recipient_type = 'all'
      or (a_recipient_type = 'team' and private.is_team_supervisor(a_team_id))
      or (a_recipient_type = 'individual' and private.supervises(a_recipient_id, 'BANCO_1'))
    else false
  end
$$;

alter table public.banco1_announcements enable row level security;
alter table public.banco1_announcement_hidden enable row level security;
revoke all privileges on table public.banco1_announcements, public.banco1_announcement_hidden from public, anon, authenticated;
grant select, insert, delete on table public.banco1_announcements to authenticated;
grant select, insert on table public.banco1_announcement_hidden to authenticated;
grant all privileges on table public.banco1_announcements, public.banco1_announcement_hidden to service_role;

drop policy if exists banco1_announcements_select on public.banco1_announcements;
create policy banco1_announcements_select on public.banco1_announcements for select to authenticated
using (private.banco1_can_see_announcement(recipient_type, team_id, recipient_id, author_id));

drop policy if exists banco1_announcements_insert on public.banco1_announcements;
create policy banco1_announcements_insert on public.banco1_announcements for insert to authenticated
with check (private.banco1_can_publish_announcement(recipient_type, team_id, recipient_id));

drop policy if exists banco1_announcements_delete on public.banco1_announcements;
create policy banco1_announcements_delete on public.banco1_announcements for delete to authenticated
using (private.module_role('BANCO_1') = 'diretor' or (author_id = auth.uid() and private.module_role('BANCO_1') = 'supervisor'));

drop policy if exists banco1_announcement_hidden_select on public.banco1_announcement_hidden;
create policy banco1_announcement_hidden_select on public.banco1_announcement_hidden for select to authenticated
using (profile_id = auth.uid());

drop policy if exists banco1_announcement_hidden_insert on public.banco1_announcement_hidden;
create policy banco1_announcement_hidden_insert on public.banco1_announcement_hidden for insert to authenticated
with check (
  profile_id = auth.uid()
  and exists (select 1 from public.banco1_announcements as a where a.id = announcement_id)
);

revoke all privileges on function private.banco1_announcements_stamp() from public, anon, authenticated;
revoke all privileges on function private.banco1_can_see_announcement(text, uuid, uuid, uuid) from public, anon;
revoke all privileges on function private.banco1_can_publish_announcement(text, uuid, uuid) from public, anon;
grant execute on function private.banco1_can_see_announcement(text, uuid, uuid, uuid) to authenticated;
grant execute on function private.banco1_can_publish_announcement(text, uuid, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
