# Pré-Etapa 3B.2B.2 — reconciliação estrutural

## Contrato implementado

- `profiles.id` continua sendo o identificador físico, inclusive para os dois perfis legados.
- `profiles.auth_user_id` é a ponte canônica, nullable para registros ainda não reconciliados e única quando preenchida.
- As funções `private.current_profile_id`, `current_profile_role` e `current_profile_squad_id` resolvem o usuário por `auth_user_id = auth.uid()` e `active = true`; não existe fallback por ID histórico ou e-mail.
- `profiles.role` converge para `public.app_role` somente depois da validação dos valores existentes.
- `access_preapprovals` é criada no caminho histórico quando ausente e validada no caminho legado; seus cinco registros sintéticos são preservados.
- O par `microsoft_tenant_id`/`microsoft_object_id` permanece nulo para pré-autorizações não reconciliadas e é único quando preenchido.
- `anon` e `authenticated` não recebem leitura direta de `access_preapprovals` nem escrita direta em `profiles`.

## Ordem das migrations

1. `20261010215524_create_initial_workforce_time_tracking_schema.sql` — cópia histórica intocada.
2. `20261016190000_identity_reconciliation_prerequisites.sql` — pré-requisitos de identidade e pré-autorização.
3. `20261016210000_stage3b1_identity_foundation.sql` — ponte e auditoria da Etapa 3B.1.
4. `20261016220000_identity_contract_convergence.sql` — tipo de cargo, funções, grants e policies canônicas.

A migration intermediária rejeita uma tabela `access_preapprovals` existente que não possua as colunas/tipos/chave primária esperados. Ela não recria tabelas nem atualiza dados reais.

## RLS e limitações

As policies que comparavam diretamente `profile_id = auth.uid()` ou `supervisor_id = auth.uid()` foram recriadas usando `private.current_profile_id()`. Os testes verificam a ausência dessas comparações diretas e o comportamento fail-closed para profiles sem vínculo e inativos.

Os testes usam PostgreSQL 15 sintético. Eles não equivalem à homologação completa do Supabase gerenciado, da Data API, das claims Auth ou do isolamento real entre squads. A restrição de `squads.supervisor_id` único permanece deliberadamente inalterada.

## Segurança

Nenhum `tid/oid` real é preenchido, nenhum profile real é criado ou modificado, e `CORPORATE_AUTHORIZATION_IMPLEMENTED=false` continua preservado. A autorização corporativa, o provisionamento e as migrations remotas permanecem bloqueados.
