# Configuração corporativa: Microsoft Entra ID no Supabase Auth

Este documento orienta a configuração necessária para homologação do fluxo:

```text
Microsoft Entra ID → Supabase Auth → sessão Supabase → pré-autorização → profile/RLS
```

A Etapa 2 mantém a autorização corporativa bloqueada por código. Configurar o provedor não libera acesso automaticamente.

## Aplicativo Entra ID

1. Usar configuração **single-tenant** com o tenant oficial da SM&A.
2. Registrar o aplicativo com o client ID fornecido à equipe responsável pelo Supabase Auth.
3. Não colocar client secret no frontend, em `VITE_*`, no repositório ou em tickets.
4. Cadastrar como redirect URI do aplicativo o callback do Supabase Auth:

   `https://<project-ref>.supabase.co/auth/v1/callback`

5. Solicitar somente os escopos OIDC mínimos `openid`, `profile` e `email`. Permissões Microsoft Graph adicionais não fazem parte desta etapa.
6. Definir política para convidados externos antes de homologar contas fora do tenant.

## Supabase Auth

Configurar o provedor Azure/Microsoft com client ID, tenant e segredo armazenados somente nos secrets do projeto Supabase. O frontend recebe somente:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_ANON_KEY`;
- `VITE_SUPABASE_ALLOWED_REDIRECTS`.

Adicionar à lista de URLs permitidas apenas os ambientes aprovados. O projeto usa `HashRouter`; portanto, o callback do frontend deve ser cadastrado na forma efetivamente resolvida pelo aplicativo, por exemplo:

`https://app.exemplo.com/#/auth/callback`

e, localmente:

`http://localhost:5173/#/auth/callback`

O cliente browser usa PKCE e o callback troca o código uma única vez. Não cadastrar URLs arbitrárias, `returnTo` recebido do navegador ou curingas amplos.

## Identidade e autorização

- O Supabase grava a identidade OAuth em `auth.identities`, incluindo `user_id` (o UUID do mesmo usuário Supabase), `provider`, `provider_id` e `identity_data`. A linha só pode ser usada para conferir o vínculo com `auth.users.id`; `provider_id` isolado não é tratado como prova de `oid` nem contém, por contrato, o `tid`.
- A implementação local em `server/entraIdentityVerifier.ts` rejeita objetos recebidos do navegador e permanece `unavailable` enquanto não houver um adaptador server-side que produza evidência opaca após verificar o token Microsoft.
- `tid` deve ser comparado server-side com `AZURE_TENANT_ID`.
- `oid` é o identificador imutável do objeto Microsoft no tenant.
- `tid` e `oid` só podem vir de claims/metadados de identidade que o Supabase Auth tenha retornado com origem verificável; body, query string, localStorage e campos editáveis do perfil nunca são prova.
- A cadeia necessária para ativar o verificador é: token Microsoft correto para o recurso, assinatura validada com JWKS, `iss`, `aud`, `exp` e nonce (quando aplicável) conferidos, tenant permitido, `oid` presente e `auth.identities.user_id` igual ao `auth.users.id` da sessão validada. Dois tokens válidos de usuários diferentes devem ser rejeitados.
- Se a homologação não comprovar a origem confiável desses identificadores, o acesso deve permanecer bloqueado.
- Quando `xms_edov` estiver presente, `false` deve ser rejeitado; `true` apenas reforça a validação e não substitui tenant, object ID, assinatura, emissor, audiência, expiração ou pré-autorização.
- `access_preapprovals` e o provisionamento definitivo ainda não são consultados na Etapa 2.

### Bloqueador atual da Etapa 3B.2A

Na produção inspecionada, a cadeia disponível não demonstra uma identidade Azure vinculada ao usuário Supabase nem entrega ao backend um token Microsoft verificado contendo `tid` e `oid`. Por isso, esta etapa implementa apenas a fronteira e os testes fail-closed; não há cenário positivo habilitável, não há perfil criado e nenhuma sessão passa a ser autorizada.

Para a próxima etapa, a TI e a administração Supabase precisam confirmar: provedor Azure single-tenant ativo, client ID/audience, issuer/JWKS, política de convidados, escopos `openid profile email`, redirect URIs e qual componente server-side validará e entregará as claims ao SM&A sem expor tokens ao navegador.

## Variáveis

### Server-only

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AZURE_TENANT_ID=
CORPORATE_AUTHORIZATION_READY=false
ENABLE_LEGACY_MSAL=false
```

`SUPABASE_SERVICE_ROLE_KEY` nunca deve ser prefixada com `VITE_` nem enviada ao navegador.

`CORPORATE_AUTHORIZATION_READY=true` não libera o sistema nesta etapa: existe um bloqueio de implementação até identidade Microsoft, pré-autorização e provisionamento idempotente estarem implementados e revisados.

`ENABLE_LEGACY_MSAL=true` só é permitido em ambiente não produtivo para testes de transição. Em produção, os endpoints MSAL/BFF respondem bloqueio explícito mesmo que a variável tenha sido configurada.

### Frontend

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_ALLOWED_REDIRECTS=http://localhost:5173/#/auth/callback
```

### Ambientes publicados

O runtime corporativo atual usa Supabase Auth no navegador; a configuração MSAL
existente permanece apenas como legado bloqueado pelos endpoints BFF e não é um
substituto para a sessão Supabase.

O workflow do GitHub Pages injeta somente as três variáveis públicas abaixo,
armazenadas como secrets do repositório para evitar valores hardcoded no YAML:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_ALLOWED_REDIRECTS
```

Para o site publicado deste repositório, o redirect efetivo do `HashRouter` é:

`https://arthurmonserrat.github.io/sma-apontamento-horas/#/auth/callback`

As configurações têm responsabilidades diferentes:

- **Microsoft Entra ID:** cadastra somente o callback do provedor Supabase Auth,
  no formato `https://<project-ref>.supabase.co/auth/v1/callback`. O callback
  final do frontend não é cadastrado diretamente no aplicativo Entra.
- **Supabase Auth:** inclui o callback final do frontend na allowlist de URLs de
  redirecionamento, exatamente como será publicado.
- **Frontend SM&A:** recebe o mesmo callback na variável pública
  `VITE_SUPABASE_ALLOWED_REDIRECTS`.

Para GitHub Pages, o valor exato é
`https://arthurmonserrat.github.io/sma-apontamento-horas/#/auth/callback`.
Para Vercel, as origens verificadas deste projeto são:

- `https://sma-apontamento-horas-murex.vercel.app/#/auth/callback` (alias de
  produção);
- `https://sma-apontamento-horas-arthur-monserrat.vercel.app/#/auth/callback`
  (alias de produção);
- `https://sma-apontamento-horas-git-main-arthur-monserrat.vercel.app/#/auth/callback`
  (alias da branch `main`);
- `https://sma-apontamento-horas-git-codex-banco1-ec1470-arthur-monserrat.vercel.app/#/auth/callback`
  (alias de preview da branch do Banco 1).

Não adicionar esses callbacks finais à configuração do aplicativo Entra.
Não incluir a chave `service_role` ou qualquer segredo do provedor no build.

No Vercel, Production e o Preview da branch do Banco 1 receberam as três
variáveis públicas (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e
`VITE_SUPABASE_ALLOWED_REDIRECTS`) com o projeto Supabase `qtrtaoyadtapcilnrhrk`.
O backend também recebeu `SUPABASE_ANON_KEY` server-side; o
`SUPABASE_SERVICE_ROLE_KEY` não foi reutilizado.

Essas variáveis só entram em um novo build. A implantação Production ainda
aponta para o commit da `main` anterior ao PR #13; por isso, a verificação do
primeiro redirecionamento deve usar o Preview renovado desta branch, e a
publicação em Production continua condicionada ao merge e ao deploy aprovado.

A ausência de qualquer variável pública produz a mensagem `Supabase Auth não
está configurado para este ambiente`; isso é uma falha de configuração do
frontend, distinta de erro de OAuth/callback e distinta do bloqueio deliberado
da autorização corporativa.

## Validação antes do piloto

1. Configurar primeiro um projeto Supabase de homologação, nunca produção.
2. Testar um diretor, um supervisor e um colaborador autorizados pela TI.
3. Registrar a presença e a origem de `tid`, `oid` e `xms_edov` sem copiar tokens para logs.
4. Confirmar que usuário sem `access_preapprovals`, perfil inativo ou cargo desconhecido permanece em `403`.
5. Verificar expiração, logout, repetição de callback e bloqueio dos endpoints legados por chamada direta.
6. Só depois da revisão de segurança implementar a integração transacional com `access_preapprovals`, `profiles.id = auth.users.id` e RLS.

## Rotação e recuperação

- Rotacionar o segredo do provedor no Supabase conforme o procedimento de TI; nunca versionar o valor antigo ou novo.
- Se o callback falhar, remover a URL/flag do ambiente de homologação e manter `CORPORATE_AUTHORIZATION_READY=false`.
- A demonstração local continua disponível e não é fallback para dados corporativos.
- Não excluir usuários Auth, alterar RLS ou executar migration como tentativa de recuperação da Etapa 2.
