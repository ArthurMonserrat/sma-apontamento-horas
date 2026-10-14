# Etapa 2 — estabilidade da sessão corporativa

## Objetivo e limite

Esta etapa centraliza o runtime corporativo em **Microsoft Entra ID → Supabase
Auth → sessão Supabase**. Ela corrige a inicialização, o callback, o logout e
os estados transitórios sem liberar autorização corporativa. A consulta de
`access_preapprovals`, o provisionamento de `profiles` e as policies RLS reais
continuam bloqueados para a Etapa 3.

Nenhuma alteração foi feita no Supabase de produção, no Azure ou em migrations.

## Fluxo atual

1. `EcosystemLogin` inicia `supabase.auth.signInWithOAuth` com o provedor
   `azure`, fluxo PKCE e escopos `openid profile email`.
2. O redirect permitido é calculado em `supabaseConfig.ts` e precisa estar
   explicitamente presente em `VITE_SUPABASE_ALLOWED_REDIRECTS`. Para o
   `HashRouter`, o formato esperado é `origin/#/auth/callback`.
3. `AuthCallbackPage` lê o código da URL, troca-o uma única vez com
   `exchangeCodeForSession` e remove `code`, `state` e erros da URL. A troca é
   deduplicada por código para suportar React StrictMode e reloads concorrentes.
4. `DemoSessionProvider` assina `onAuthStateChange`, restaura a sessão com
`getSession` e expõe estados explícitos: `initializing`, `unauthenticated`,
   `authenticating`, `signing_out`, `authenticated_unauthorized`,
   `authorized` e `error`.
5. Uma sessão Supabase válida ainda termina em
   `authenticated_unauthorized`, pois não existe autorização corporativa
   definitiva nesta etapa. Não há fallback para MSAL, Graph, e-mail, cargo
   enviado pelo navegador ou localStorage.
6. Logout remove imediatamente a sessão local para bloquear as rotas, aguarda a
   confirmação de `supabase.auth.signOut` e deduplica cliques repetidos. Em
   sucesso, o estado termina em `unauthenticated`; em falha, termina em `error`
   com mensagem explícita e continua sem sessão local, evitando acesso durante
   a incerteza. O SSO Microsoft pode manter a conta no provedor; isso é
   independente da sessão Supabase e deve ser tratado na homologação.

## Estados e falhas

Toda inicialização termina em sessão ausente, não autorizada ou erro
controlado. Falha de rede ao restaurar a sessão não é convertida em sessão
anônima silenciosa. Falha no callback retorna ao ecossistema com mensagem de
nova tentativa. A ausência de autorização nunca é resolvida por timeout.

## Demonstração

Os fixtures e serviços de domínio permanecem disponíveis para testes. A
restauração de sessão demonstrativa só é habilitada em `MODE=test` ou em
desenvolvimento local (`import.meta.env.DEV` com `VITE_ENABLE_DEMO_MODE=true`).
O bundle de produção não restaura sessões locais, mesmo que a variável pública
seja configurada. O botão público e as rotas de seleção manual de cargo foram
removidos do fluxo do usuário.

## Bancos de horas

O Banco 1 permanece nesta aplicação. O Banco 2 é uma aplicação separada no
repositório `ArthurMonserrat/banco-de-horas-2`, com contrato de autenticação
próprio ainda não homologado. Seu botão permanece indisponível mesmo que
`VITE_BANCO_HORAS_2_URL` exista: uma URL, isoladamente, não prova que o SSO,
callback, sessão ou autorização entre os dois projetos estão configurados.
Não existe fallback para o Banco 1 nem URL inventada. A futura estratégia de
SSO deverá compartilhar a identidade sem enviar tokens por URL, e cada banco
continuará validando sua autorização específica.

## Contrato necessário para a Etapa 3

Somente o servidor poderá validar o JWT Supabase e extrair identidade confiável
do provedor. A implementação futura deverá:

- validar assinatura, issuer, audience, expiração, `tid` e `oid` no servidor;
- consultar `access_preapprovals` por identidade Microsoft verificada, nunca por
  cargo editável ou e-mail isolado;
- provisionar/atualizar `profiles.id = auth.users.id` de forma idempotente;
- verificar `active`, cargo e vínculos de equipe antes de retornar autorização;
- devolver apenas o perfil autorizado ao frontend;
- aplicar RLS por `auth.uid()` e por equipe, sem `service_role` no navegador.

Até que esses passos existam e sejam homologados com uma conta Entra real, o
endpoint `/api/supabase-session` deve continuar respondendo bloqueio de
autorização e o login corporativo não está pronto para piloto.

## Dependências externas

A equipe de TI ainda precisa confirmar o tenant single-tenant, client ID,
provedor Azure no Supabase, redirects de desenvolvimento/preview/produção e
permissões do aplicativo. A homologação deverá coletar apenas códigos de erro
e metadados não sensíveis; tokens, cookies e segredos não devem ser impressos.
