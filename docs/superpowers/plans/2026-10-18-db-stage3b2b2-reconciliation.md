# Plano: reconciliação estrutural das migrations e do schema legado

## Objetivo

Permitir a construção de um banco novo e a atualização segura de um schema legado sem reescrever a migration histórica, sem associar perfis por e-mail e sem habilitar autorização corporativa.

## Contrato canônico

- `profiles.id` é preservado como identificador físico, inclusive nos dois registros legados.
- `profiles.auth_user_id` é a única ponte entre `auth.users.id` e um profile autorizado; permanece nullable para legados não reconciliados e possui índice único parcial.
- Novos profiles devem usar `id = auth.users.id` e `auth_user_id = auth.users.id`.
- As funções de identidade usam somente `auth_user_id = auth.uid()` e `active = true`; não há fallback por `profiles.id` ou e-mail.
- `profiles.role` converge para `public.app_role` depois da validação dos valores existentes.
- `access_preapprovals` preserva os cinco registros e aceita IDs Microsoft nulos somente para registros ainda não reconciliados. O par tenant/object é obrigatório quando preenchido e único quando presente.
- Perfis, pré-autorizações e auditoria não são graváveis diretamente por `anon`/`authenticated`.
- A unicidade atual de `squads.supervisor_id` é preservada nesta etapa.

## Sequência

1. Baseline histórica `20261010215524` — intocada.
2. `20261016190000_identity_reconciliation_prerequisites.sql` — cria/valida `access_preapprovals`, seus checks/índices e privilégios mínimos; rejeita estrutura existente incompatível.
3. `20261016210000_stage3b1_identity_foundation.sql` — migration já versionada.
4. `20261016220000_identity_contract_convergence.sql` — converte `profiles.role` com validação, atualiza funções para `auth_user_id`, cria o helper de profile físico e recria policies que comparavam diretamente `auth.uid()`.

## Testes

- Cenário novo: prelude Auth → migration histórica → prerequisites → 3B.1 → convergence → assertions.
- Cenário legado: baseline sintético completo com `profiles.id` legado, `role text`, `access_preapprovals` e tabelas de negócio → mesma sequência → assertions.
- Assertions cobrem preservação de linhas, pares Microsoft, unicidade, FKs, conversão de role, funções fail-closed, policies, grants e tentativas de escrita privilegiada.
- GitHub Actions usa dois PostgreSQL 15 descartáveis, sem secrets ou conexão Supabase.

## Limites

O plano não preenche `tid/oid`, não cria profiles reais, não executa migrations remotas e não declara RLS do Supabase gerenciado homologado. A Etapa 4 continuará necessária para testes completos de isolamento e Data API.
