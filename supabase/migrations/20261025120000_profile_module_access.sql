begin;

-- Acesso por banco do Ecossistema SM&A (Banco 1, Banco 2).
-- Uma linha = a pessoa pode entrar naquele banco. Sem linha = sem acesso.
-- role vazio (null) = usa o cargo geral de public.profiles.role; preenchido = cargo só naquele banco.
create table if not exists public.profile_module_access (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  module text not null check (module in ('BANCO_1', 'BANCO_2')),
  role text check (role is null or role in ('colaborador', 'supervisor', 'diretor')),
  active boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by text,
  primary key (profile_id, module)
);

comment on table public.profile_module_access is
  'Bancos do Ecossistema liberados por pessoa. role null herda profiles.role. Gerenciado pela Administração.';

alter table public.profile_module_access enable row level security;

revoke all privileges on table public.profile_module_access from public, anon, authenticated;
grant select on table public.profile_module_access to authenticated;
grant select, insert, update, delete on table public.profile_module_access to service_role;

drop policy if exists profile_module_access_select_own on public.profile_module_access;
create policy profile_module_access_select_own on public.profile_module_access
for select to authenticated
using (profile_id = auth.uid());

-- Transição: quem já tem perfil hoje continua entrando no Banco 1.
-- Usuários novos (JIT) NÃO recebem acesso automático: a Administração libera um a um.
insert into public.profile_module_access (profile_id, module, granted_by)
select p.id, 'BANCO_1', 'migration:20261025120000'
from public.profiles as p
on conflict (profile_id, module) do nothing;

commit;
