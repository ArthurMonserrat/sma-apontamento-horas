# Etapa 3B.1 — Fundação de identidade corporativa

> **Para execução:** preservar `CORPORATE_AUTHORIZATION_IMPLEMENTED=false`, `/api/provision` bloqueado e a separação demo/corporativo.

**Objetivo:** criar contratos server-side testáveis para identidade Microsoft confiável e preparar uma migration reversível para vincular futuros profiles a `auth.users`, sem modificar produção.

**Arquitetura:** a validação de identidade recebe somente dados já verificados por uma camada server-side; tenant/object ID e cargo nunca vêm do frontend. A migration adiciona colunas e constraints compatíveis com os dois profiles legados, corrige as funções RLS quebradas e cria auditoria privada, sem inserir, atualizar ou excluir registros.

**Escopo:** tipos/validadores de identidade, matching de pré-autorização, testes de regressão e migration SQL versionada. Não inclui endpoint de autorização, provisionamento, RLS operacional, Azure ou Supabase remoto.

## Tarefas

1. Escrever testes falhos para identidade confiável, matching por tenant/object ID, estados inativos/nulos e rejeição de dados editáveis.
2. Implementar contratos em `server/corporateIdentity.ts` e manter a política corporativa fail-closed.
3. Escrever testes falhos de segurança da migration e criar migration aditiva, sem dados reais, com bridge para profiles legados, índices de identidade, squad opcional, auditoria privada e correção das funções RLS.
4. Executar testes, lint, typecheck, build e `git diff --check`; revisar que nenhuma migration foi aplicada remotamente.

## Critérios de aceitação

- Identidade sem tenant/object ID, tenant divergente ou object ID divergente é negada.
- Cargo só pode vir da pré-autorização ativa; input do frontend não participa da decisão.
- Pré-autorização ativa sem IDs Microsoft continua não autorizada.
- Nenhum profile legado é alterado.
- A migration não contém inserts, updates, deletes ou drops.
- A autorização corporativa e `/api/provision` permanecem bloqueados.
