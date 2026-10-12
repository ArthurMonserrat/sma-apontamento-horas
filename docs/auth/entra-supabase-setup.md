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

- `tid` deve ser comparado server-side com `AZURE_TENANT_ID`.
- `oid` é o identificador imutável do objeto Microsoft no tenant.
- `tid` e `oid` só podem vir de claims/metadados de identidade que o Supabase Auth tenha retornado com origem verificável; body, query string, localStorage e campos editáveis do perfil nunca são prova.
- Se a homologação não comprovar a origem confiável desses identificadores, o acesso deve permanecer bloqueado.
- Quando `xms_edov` estiver presente, `false` deve ser rejeitado; `true` apenas reforça a validação e não substitui tenant, object ID, assinatura, emissor, audiência, expiração ou pré-autorização.
- `access_preapprovals` e o provisionamento definitivo ainda não são consultados na Etapa 2.

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
