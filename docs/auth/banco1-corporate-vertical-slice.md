# Banco 1 — Diagnóstico e contrato da primeira fatia corporativa

## Diagnóstico atual

O botão de entrada inicia o fluxo Azure OAuth do Supabase Auth com PKCE. A sessão Supabase é restaurada pelo cliente, mas `DemoSessionProvider` classifica qualquer sessão não-demo como `authenticated_unauthorized` e não a converte em perfil corporativo. Isso é consequência intencional do bloqueio de `/api/supabase-session`, não uma falha de restauração de sessão.

O fluxo MSAL/BFF anterior não deve ser simplesmente reativado: os endpoints antigos carregam um token Microsoft em cookie e consultam o Graph, mas não constituem, por si só, uma sessão corporativa com state/PKCE/CSRF e autorização administrativa completa. Eles permanecem bloqueados em produção. A arquitetura escolhida para o Banco 1 é manter Supabase Auth como autoridade única e adicionar um adaptador server-side verificável quando a TI disponibilizar a evidência de vínculo Entra↔Supabase.

## O que é real e o que é demonstração

- OAuth Azure, PKCE, callback HashRouter e restauração de sessão existem no frontend.
- A fronteira de verificação de token Microsoft existe isoladamente, mas o mapeamento comprovado entre o token e `auth.identities.id` ainda está indisponível; portanto ela não produz autorização.
- `/api/provision` continua bloqueado e `CORPORATE_AUTHORIZATION_IMPLEMENTED=false` permanece efetivamente falso.
- Apontamentos, aprovações, perfil e parte dos dados de equipe ainda usam serviços LocalStorage/fixtures no modo demonstrativo. Isso não é persistência corporativa.
- O schema versionado possui tabelas de apontamentos e aprovações, porém o modelo rico do frontend contém campos que não têm coluna equivalente confirmada. Um serviço real só deve ser implementado após o contrato de dados e RLS serem homologados.

## Primeiro slice entregue

Esta entrega formaliza um avaliador server-side fail-closed. Ele só poderá autorizar quando receber, de componentes server-side, uma sessão Supabase válida, um binding Entra verificado para o mesmo `auth.users.id`, uma pré-autorização ativa com tenant/object ID e um profile ativo consistente. E-mail, metadata, localStorage, cargo enviado pelo navegador e sessão demonstrativa não participam da decisão.

Como o produtor real da evidência de vínculo ainda não existe, a autorização corporativa continua bloqueada. O slice não cria profiles, não altera banco e não transforma a sessão Supabase em sessão demo.

## Próxima entrega concreta

1. Homologar em ambiente Supabase gerenciado isolado a identidade Azure retornada em `auth.identities`, preservando `auth.users.id` e sem divulgar tokens.
2. Implementar o adaptador server-side que produzirá o binding opaco somente após validar assinatura/JWKS, issuer, audience, tenant, oid, sub, expiração/nonce e vínculo ao mesmo `auth.identities.id`.
3. Somente depois, implementar `SupabaseTimeEntryService` e o serviço de aprovações sobre a Data API/RLS homologada, mantendo os serviços LocalStorage apenas no demo.

## Handoff de persistência real

O modelo `TimeEntry` do frontend contém `entryDate`, `clientName`, `projectCode`, `contractorNumber`, `ldDocument`, `activityId`, `disciplineCode`, `documentTypeCode`, `durationMinutes`, `details`, snapshot de atribuição, status, versão e motivos de cancelamento. A tabela histórica `time_entries` confirma data, horários, duração, projeto, descrição, status, versão e cancelamento, mas não oferece colunas confirmadas para cliente, atividade, disciplina, tipo de documento, contratada ou snapshot de atribuição. Esses campos não podem ser descartados silenciosamente nem codificados em uma coluna sem contrato.

O serviço corporativo futuro deve usar o cliente Supabase autenticado no navegador e as policies/RLS para leitura e escrita; `service_role` fica restrito a operações administrativas server-side. A migração de contrato precisa ser aprovada e testada em Supabase local/gerenciado isolado antes de trocar o serviço de runtime. As operações de aprovação devem persistir `daily_approvals`/histórico com controle de versão e verificar a squad do supervisor no banco, não em fixtures.
