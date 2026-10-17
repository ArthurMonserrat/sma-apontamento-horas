# Validação da migration da Etapa 3B.1

## Histórico e baseline

O projeto Supabase remoto possui a migration `20261010215524` aplicada, enquanto a branch traz apenas a migration incremental da Etapa 3B.1. A migration remota anterior não foi copiada para o repositório nem marcada artificialmente como aplicada.

Para validação, `supabase/tests/stage3b1_baseline.sql` reproduz somente a estrutura necessária, com dados fictícios: `auth.users`, `profiles`, `access_preapprovals`, `squads`, `app_role`, `auth.uid()` e os contratos antigos das funções privadas. O script também simula aplicação parcial adicionando `auth_user_id` antes da migration.

O workflow `.github/workflows/validate-stage3b1-migration.yml` executa esse baseline em PostgreSQL 15 descartável, aplica `20261016210000_stage3b1_identity_foundation.sql` duas vezes e executa assertions SQL. Não usa Supabase project ref, secrets, rede corporativa ou dados reais.

Isso valida PostgreSQL e a migration sintética, mas não substitui homologação Supabase: o baseline não reproduz todos os objetos internos de Auth, Data API, RLS gerenciado ou claims reais.

## Perfis legados

A migration não altera os IDs existentes. `profiles.auth_user_id` é uma ponte nullable para uma futura reconciliação administrativa. As funções continuam usando `profiles.id = auth.uid()`, portanto um perfil legado não ganha acesso apenas porque o e-mail coincide ou porque `auth_user_id` foi preenchido. Novos perfis corporativos deverão usar `profiles.id = auth.users.id`.

Qualquer associação de perfil legado exige uma decisão administrativa, evidência de identidade Microsoft e uma entrega específica posterior. Não deve ser feita automaticamente na Etapa 3B.2.

## Decisão pendente de histórico

Antes de aplicar em qualquer ambiente Supabase, a equipe deve comparar a migration `20261010215524` real com o baseline versionado e decidir se o repositório será reconciliado por um dump estrutural sanitizado ou por documentação da baseline externa. Nenhuma alteração no histórico remoto deve ser executada por esta branch.

## Limites de segurança

O workflow não habilita autorização corporativa, não executa provisionamento e não preenche tenant/object IDs. A prova de identidade Microsoft continua bloqueada até existir um verificador server-side que vincule `tid` e `oid` ao mesmo usuário Supabase autenticado.
