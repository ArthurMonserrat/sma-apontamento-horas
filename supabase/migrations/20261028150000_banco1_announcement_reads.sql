begin;

-- =====================================================================
-- Banco 1 — avisos lidos (para o contador e o balão de notificação)
-- * Cada pessoa marca como lidos os avisos que já viu (vale em qualquer aparelho).
-- * Só é possível marcar avisos que a pessoa consegue ver.
-- Pré-requisito: 20261027180000_banco1_announcements.sql aplicada.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

do $$
begin
  if to_regclass('public.banco1_announcements') is null then
    raise exception 'Aplique antes a migration 20261027180000_banco1_announcements.sql.';
  end if;
end;
$$;

create table if not exists public.banco1_announcement_reads (
  announcement_id uuid not null references public.banco1_announcements(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

comment on table public.banco1_announcement_reads is 'Avisos do Banco 1 que cada pessoa já leu.';

alter table public.banco1_announcement_reads enable row level security;
revoke all privileges on table public.banco1_announcement_reads from public, anon, authenticated;
grant select, insert on table public.banco1_announcement_reads to authenticated;
grant all privileges on table public.banco1_announcement_reads to service_role;

drop policy if exists banco1_announcement_reads_select on public.banco1_announcement_reads;
create policy banco1_announcement_reads_select on public.banco1_announcement_reads for select to authenticated
using (profile_id = auth.uid());

drop policy if exists banco1_announcement_reads_insert on public.banco1_announcement_reads;
create policy banco1_announcement_reads_insert on public.banco1_announcement_reads for insert to authenticated
with check (
  profile_id = auth.uid()
  and exists (select 1 from public.banco1_announcements as a where a.id = announcement_id)
);

commit;

notify pgrst, 'reload schema';
