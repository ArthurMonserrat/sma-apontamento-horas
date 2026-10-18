# Etapa 3B.3B — Plano de homologação gerenciada isolada

## Status e limites

Este documento é um plano operacional. Nenhum projeto ou branch Supabase
gerenciado foi criado, nenhuma migration remota foi executada e nenhuma
configuração Azure, Supabase, Vercel ou GitHub foi alterada nesta etapa.

`CORPORATE_AUTHORIZATION_IMPLEMENTED=false` permanece obrigatório. O endpoint
`/api/provision` continua bloqueado e `/api/supabase-session` não concede
autorização corporativa. A existência de uma sessão Supabase ou de uma
identidade Azure não libera módulos, cargos ou profiles.

## Inventário confirmado

A consulta de leitura ao ambiente Supabase atualmente configurado encontrou um
único projeto ativo, sem branches Supabase disponíveis. O histórico de
migrations remoto contém a migration histórica `20261010215524`; o schema
remoto possui objetos legados posteriores, incluindo pré-autorizações e
profiles que não devem ser copiados para homologação. Nenhum dado, token ou
identificador de usuário é reproduzido neste documento.

Esse projeto não é um ambiente seguro para experimentar OAuth, RLS ou a
reconciliação: a produção ainda requer as migrations de convergência e a
revisão dos privilégios. O frontend publicado não deve apontar para ele para
testes de login.

## Ambiente recomendado

Solicitar à organização um projeto Supabase gerenciado separado, com cobrança
e proprietário aprovados pela TI, ou um recurso equivalente já existente para
homologação. O projeto deve ter:

1. URL, chaves e redirect allowlist próprios, sem reutilizar segredos de
   produção;
2. migrations versionadas aplicadas em ordem, incluindo o baseline histórico,
   a reconciliação e as correções de privilégios aprovadas;
3. Azure Provider configurado para o tenant de teste e somente os redirects
   do projeto de homologação;
4. Auth, PostgREST/Data API e RLS habilitados;
5. apenas usuários, profiles, squads, pré-autorizações e apontamentos
   sintéticos;
6. acesso administrativo restrito à TI e ao responsável técnico, sem
   compartilhamento de `service_role`.

Se a organização não aprovar um projeto separado, a alternativa segura é
continuar apenas com PostgreSQL descartável para schema e com tokens sintéticos
para o verificador. Isso não substitui a homologação de Auth, Data API ou RLS
do Supabase gerenciado.

## Sequência de homologação

1. Criar o projeto separado e registrar o proprietário, região, plano e
   política de retenção. Não importar dados de produção.
2. Aplicar as migrations em ambiente descartável do projeto, validando o
   checksum histórico e registrando cada versão. `db push` deve apontar apenas
   para o projeto de homologação.
3. Configurar o provider Azure com aplicativo/tenant de teste aprovado pela TI,
   escopo `openid profile email`, callback do Supabase Auth e redirects exatos
   do frontend de homologação.
4. Criar usuários fictícios pelo Auth administrativo local do projeto e
   preparar fixtures sintéticas por SQL controlado. Não preencher identidades
   Microsoft reais nem habilitar cargos corporativos.
5. Exercitar a Data API com tokens emitidos pelo Auth do projeto: anon,
   usuários sem vínculo, profile inativo, colaborador, supervisor e diretor
   sintéticos. Verificar conteúdo retornado, não somente status HTTP.
6. Exercitar RLS e privilégios efetivos para leitura, escrita, alteração de
   role/auth_user_id, acesso entre squads, pré-autorizações e auditoria.
7. Em uma janela aprovada pela TI, usar uma conta Microsoft de teste. Capturar
   apenas IDs não secretos e códigos de correlação: `auth.users.id`,
   `auth.identities.id/user_id/provider`, `tid`, `oid`, issuer, audience e
   resultado da validação. Nunca registrar tokens, cookies, authorization code
   ou client secret.
8. Confirmar que a identidade Azure e o token verificado pertencem ao mesmo
   `auth.users.id`. Mesmo com essa prova, manter autorização corporativa
   bloqueada até a etapa de provisionamento aprovada.
9. Repetir com tenant incorreto, conta sem pré-autorização, identidade
   desvinculada, token expirado, audience/issuer incorretos e evidência de
   usuário diferente. Todos devem terminar sem autorização.

## Critérios de sucesso e falha

Sucesso exige: login pelo Supabase Auth; identidade Azure registrada; token
Microsoft validado por assinatura/JWKS, issuer, audience, expiração, nonce
quando aplicável, tenant e `oid`; vínculo inequívoco com o mesmo
`auth.users.id`; respostas RLS esperadas; nenhum segredo nos logs; e nenhuma
alteração no projeto de produção.

Falha deve interromper a homologação se houver ambiguidade entre usuários,
tenant não permitido, provider sem semântica documentada, claims apenas
decodificadas, permissões excessivas, callback incorreto, vazamento de token ou
qualquer autorização resultante de e-mail/metadata/localStorage.

## Rollback e custos

O rollback da homologação é o descarte do projeto separado ou a restauração de
um snapshot dele, nunca uma alteração no projeto de produção. Antes de criar o
recurso, a TI deve aprovar plano/custo, proprietário, região, retenção,
permissões e janela de testes. Nenhum recurso pago foi criado nesta etapa.

## Solicitação mínima à TI

Confirmar por canal administrativo:

- projeto Supabase de homologação e responsável/custo;
- tenant e aplicativo Entra de teste, single-tenant, audience e JWKS;
- redirect URI do Supabase Auth e allowlist do frontend;
- escopos e política para convidados;
- forma documentada de obter o token Microsoft apropriado no backend e
  relacioná-lo ao `auth.identities.id` do mesmo usuário;
- autorização para executar migrations e criar apenas fixtures sintéticas;
- procedimento de coleta de logs sem tokens e critério formal de aprovação.

Segredos, client secrets, tokens e cookies nunca devem ser enviados por
mensagem ou versionados.

## Bloqueios atuais

O verificador criptográfico isolado está preparado e testado com chaves
sintéticas, mas não existe ainda um produtor confiável ligado ao OAuth Azure do
Supabase nem um projeto gerenciado separado para provar esse vínculo. Portanto,
o resultado de identidade permanece indisponível para autorização e o
provisionamento continua fora do escopo.

## Referências normativas

- [Microsoft Entra — ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)
- [Microsoft Entra — access tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)
- [Microsoft Entra — OpenID Connect](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)
- [Supabase — Azure login](https://supabase.com/docs/guides/auth/social-login/auth-azure)
