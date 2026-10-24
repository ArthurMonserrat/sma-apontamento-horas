# Runbook: migration de `profiles.id` e JIT Azure

Esta migration corrige o contrato de identidade informado para produção. Ela **não foi executada** por este runbook nem pelo PR. Aplique somente após revisão e backup.

Arquivo: `supabase/migrations/20261024120000_profiles_id_jit_contract.sql`

## 1. Backup e preparação

1. Crie/valide um backup recuperável do projeto no Supabase antes da janela de mudança. Se usar `pg_dump`, preserve também o DDL das funções, triggers e policies consultadas abaixo.
2. Salve o resultado das consultas de pré-checagem em local seguro. A migration substitui funções existentes, recria policies conhecidas e recria o trigger JIT.
3. Execute como role administrativa capaz de alterar `public.profiles`, objetos `private` e triggers em `auth.users`.

## 2. Pré-checagens no SQL Editor

### Triggers de `auth.users`

Revise todos os triggers não internos e identifique outros que também criem perfil. O trigger JIT do PR pode duplicar trabalho caso já exista outro provisionador.

```sql
select
  t.tgname,
  pg_get_triggerdef(t.oid) as trigger_definition,
  p.oid::regprocedure as trigger_function,
  pg_get_functiondef(p.oid) as function_definition
from pg_trigger as t
join pg_proc as p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal
order by t.tgname;
```

### Funções privadas atuais

Guarde as definições para rollback. Observe especialmente o tipo de retorno de `current_profile_role()`.

```sql
select p.oid::regprocedure as function_signature,
       pg_get_function_result(p.oid) as return_type,
       pg_get_functiondef(p.oid) as function_definition
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in (
    'current_profile_id', 'current_profile_role', 'current_profile_squad_id',
    'is_in_current_squad', 'provision_azure_collaborator', 'handle_azure_auth_user_created'
  )
order by p.proname;
```

### Perfis órfãos em relação a `auth.users`

```sql
select count(*) as orphan_profiles
from public.profiles as p
left join auth.users as u on u.id = p.id
where u.id is null;
```

Com zero órfãos, a migration adiciona (se ainda não existir) a FK `profiles.id -> auth.users.id` com `ON DELETE CASCADE`, primeiro `NOT VALID` e depois validada. Com órfãos, ela emite `NOTICE` e não cria a FK; nenhum perfil é apagado.

### Policies em `profiles` e dependências do helper de role

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename = 'profiles')
   or (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%current_profile_role%'
order by schemaname, tablename, policyname;
```

Confira também dependências registradas pelo PostgreSQL:

```sql
select pg_describe_object(d.classid, d.objid, d.objsubid) as dependent_object
from pg_depend as d
where d.refclassid = 'pg_proc'::regclass
  and d.refobjid = to_regprocedure('private.current_profile_role()');
```

Compare com os nomes tratados nominalmente pela migration. Se houver policy adicional dependente de `current_profile_role()`, pare e revise-a antes de aplicar: o preflight da migration aborta em vez de removê-la genericamente.

## 3. Aplicação

1. Confirme backup e revisão das policies/triggers.
2. No Supabase SQL Editor, execute o arquivo **inteiro** em uma única execução. Ele usa `BEGIN/COMMIT`; qualquer erro aborta a transação.
3. Só aplique após aprovação explícita do PR e durante a janela de mudança autorizada.

## 4. Pós-verificações

### Trigger JIT ativo

```sql
select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger as t
where t.tgrelid = 'auth.users'::regclass
  and t.tgname = 'on_auth_user_created_provision_azure_collaborator'
  and not t.tgisinternal;
```

### FK e órfãos

```sql
select c.conname, c.convalidated, pg_get_constraintdef(c.oid) as definition
from pg_constraint as c
where c.conrelid = 'public.profiles'::regclass
  and c.contype = 'f'
  and c.conkey = array[(select a.attnum from pg_attribute as a
                        where a.attrelid = 'public.profiles'::regclass
                          and a.attname = 'id' and not a.attisdropped)]::smallint[]
  and c.confrelid = 'auth.users'::regclass;

select count(*) as orphan_profiles
from public.profiles as p
left join auth.users as u on u.id = p.id
where u.id is null;
```

Se a contagem de pré-checagem era zero, deve existir uma FK validada. Se havia órfãos, a ausência da FK foi intencional e deve ser reavaliada após corrigir os registros manualmente.

### Policy de leitura e helper atualizado

```sql
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'profiles';

select p.oid::regprocedure, pg_get_function_result(p.oid)
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname = 'current_profile_role';
```

`profiles_select_own` deve usar `id = auth.uid()` e o helper deve retornar `text`.

### Teste de SELECT com contexto autenticado

Use um UUID real de usuário que tenha linha em `profiles`. Execute como role administrativa no SQL Editor:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<AUTH_USER_UUID>', true);
select set_config('request.jwt.claims', '{"sub":"<AUTH_USER_UUID>","role":"authenticated"}', true);
select id, email, full_name, role, active
from public.profiles
where id = auth.uid();
rollback;
```

O resultado deve conter somente o perfil cujo `id` corresponde ao usuário autenticado. Faça também um login real no Preview/ambiente aprovado e valide `GET /api/supabase-session`.

## 5. Rollback

1. Se o trigger recém-criado estiver causando problemas, desative o fluxo removendo somente `on_auth_user_created_provision_azure_collaborator`:

   ```sql
   drop trigger if exists on_auth_user_created_provision_azure_collaborator on auth.users;
   ```

2. Restaure as definições de funções e policies salvas na pré-checagem/backup. `current_profile_role()` pode exigir `DROP FUNCTION` antes de recriar com o tipo de retorno anterior; restaure as policies que dependem dela na mesma janela.
3. Se a migration criou `profiles_id_auth_users_fkey`, remova-a apenas após confirmar que esse foi o nome criado por ela e com aprovação:

   ```sql
   alter table public.profiles drop constraint if exists profiles_id_auth_users_fkey;
   ```

4. Restaure as policies `profiles_select_own`, `profiles_select_supervisor_team` e `profiles_select_director` conforme o DDL salvo. Não restaure cegamente `squad_id` se a coluna continuar ausente.
5. A migration não atualiza nem apaga perfis. Uma FK criada com `ON DELETE CASCADE` altera o comportamento de exclusão futura de `auth.users`; se isso for indesejado, pare antes da aplicação e ajuste/revise a migration.
