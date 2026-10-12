# Especificação técnica — autenticação corporativa unificada com Supabase Auth e Microsoft Entra ID

**Status:** aguardando aprovação para implementação
**Branch:** `codex/auth-stage2-supabase`
**Escopo:** Etapa 2 da preparação de autenticação corporativa do SM&A
**Data:** 2026-10-12

## 1. Objetivo

Adotar o Supabase Auth como autoridade única de sessão corporativa, utilizando Microsoft Entra ID/Azure como provedor de identidade:

```text
Microsoft Entra ID
        ↓
Supabase Auth
        ↓
JWT/sessão Supabase
        ↓
autorização corporativa
        ↓
profiles
        ↓
RLS baseada em auth.uid()
```

Esta etapa prepara e testa localmente os contratos do novo fluxo, sem declarar o login corporativo pronto antes da liberação e validação da equipe de TI.

O modo demonstrativo continua existindo, mas não será aceito como sessão corporativa e não poderá ser usado para consultar dados corporativos reais.

Nesta etapa, a autenticação Supabase poderá ser preparada e testada com mocks, mas a autorização corporativa real permanecerá explicitamente bloqueada até que `access_preapprovals`, a identidade Microsoft verificada e o provisionamento definitivo estejam integrados.

## 2. Estado atual relevante

O código possui dois fluxos Microsoft distintos:

1. `frontend/src/pages/access/EcosystemLogin.tsx` usa `@azure/msal-browser` diretamente com `loginPopup`.
2. `api/login.ts`, `api/redirect.ts`, `api/me.ts` e `api/logout.ts` implementam um fluxo BFF com MSAL Node e o cookie `sma_session`.

O cookie legado contém um token de acesso do Microsoft Graph, não uma sessão Supabase. O endpoint `api/provision.ts` usa `service_role` no servidor e, após a Etapa 1, apenas retorna um perfil já existente, ativo e com cargo conhecido.

Não existe atualmente no frontend:

- cliente Supabase Auth;
- `signInWithOAuth` com provedor Azure;
- tratamento de callback Supabase;
- `onAuthStateChange`;
- sessão corporativa baseada em JWT Supabase;
- resolução confiável de `tenant_id` e `object_id` Microsoft.

As correções fail-closed da Etapa 1 devem permanecer intactas.

## 3. Decisão arquitetural

### 3.1 Autoridade oficial

O Supabase Auth será a autoridade de sessão corporativa. O Microsoft Entra ID será o provedor externo de identidade configurado no Supabase Auth.

O frontend não manterá um fluxo corporativo MSAL paralelo como fallback automático.

### 3.2 Modo legado

O código legado de MSAL/BFF será preservado temporariamente para facilitar a transição e auditoria, mas não será utilizado como caminho corporativo padrão.

Se um modo legado for mantido durante a transição, todos os endpoints MSAL/BFF deverão exigir uma configuração explícita de desenvolvimento, como `ENABLE_LEGACY_MSAL=true`, combinada com ambiente não produtivo. Ausência da configuração ou execução em produção deverá resultar em bloqueio do endpoint, sem redirecionamento alternativo.

### 3.3 Modo demonstrativo

O modo demo continuará usando `LocalDemoSessionService` e dados locais de demonstração.

Regras obrigatórias:

- sessão demo deve conter `isDemo: true`;
- sessão demo não pode ser convertida em sessão Microsoft;
- sessão demo não pode restaurar perfil corporativo;
- dados demo permanecem em adaptadores locais;
- endpoints corporativos não aceitam a sessão demo como autenticação;
- a conta Microsoft ativa no navegador, sozinha, não autentica rotas protegidas.

## 4. Fluxo corporativo proposto

### 4.1 Início do login

O botão corporativo iniciará:

```ts
supabase.auth.signInWithOAuth({
  provider: 'azure',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
    scopes: 'openid profile email',
  },
})
```

O client ID e o segredo do aplicativo Azure não serão incluídos no bundle do frontend. O frontend utilizará somente:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_ANON_KEY`.

O `SUPABASE_SERVICE_ROLE_KEY` continuará restrito às funções server-side.

O cliente Supabase será configurado com `flowType: 'pkce'`. O fluxo PKCE deverá usar o armazenamento de sessão do navegador somente para o verificador transitório, nunca para cargos ou autorização.

O redirecionamento será aceito somente para URLs explicitamente cadastradas no Supabase Auth e no aplicativo Azure. O ambiente de produção e o ambiente local terão listas separadas; não será permitido redirecionamento arbitrário recebido do navegador.

### 4.2 Callback

Será criada uma rota pública `/auth/callback` responsável por:

1. receber o retorno do Supabase Auth;
2. trocar o `code` por uma sessão utilizando `exchangeCodeForSession` quando necessário;
3. aguardar a confirmação da sessão;
4. solicitar o perfil corporativo autorizado ao backend;
5. redirecionar para a área correspondente ao papel;
6. voltar para `/` com mensagem segura quando a autorização falhar.

O callback não atribuirá cargo e não criará perfil.

O tratamento do callback deverá:

- aceitar uma troca de código somente uma vez;
- verificar se já existe sessão válida antes de trocar o mesmo código novamente;
- limpar `code`, `state` e parâmetros sensíveis da URL após o processamento;
- tratar código ausente, expirado, reutilizado ou inválido como falha de autenticação;
- não registrar código, token, PKCE verifier ou erro sensível em logs;
- usar a proteção de estado e PKCE fornecida pelo Supabase Auth, sem implementar uma segunda troca manual;
- impedir que uma segunda renderização React em modo StrictMode repita a troca.

### 4.3 Restauração da sessão

O provider de sessão deverá observar `onAuthStateChange` e consultar `getSession`/`getUser` do Supabase Auth.

Uma sessão Supabase sem perfil corporativo ativo será tratada como não autorizada. O estado local não poderá transformar essa sessão em colaborador.

Sessões expiradas, inválidas ou revogadas deverão limpar o estado corporativo e retornar o usuário ao ecossistema/login.

### 4.4 Consulta do perfil corporativo

Será preparado o endpoint server-side `api/supabase-session.ts` com este comportamento:

1. exigir `Authorization: Bearer <supabase-access-token>`;
2. validar o usuário por Supabase Auth;
3. obter o `auth.users.id` autenticado;
4. verificar o bloqueio de autorização da Etapa 2;
5. exigir que a integração definitiva com `access_preapprovals`, identidade Microsoft verificada e provisionamento esteja explicitamente habilitada;
6. consultar o perfil corporativo no servidor;
7. exigir perfil existente, `active = true` e cargo conhecido;
8. retornar somente os dados necessários para roteamento;
9. negar acesso em qualquer ausência, inconsistência ou erro.

O endpoint não criará registros nesta etapa. Mesmo que exista um perfil isolado, ele não poderá liberar acesso enquanto a autorização definitiva não estiver habilitada. O valor padrão da configuração será bloqueado.

### 4.5 Logout

O logout corporativo deverá:

- executar `supabase.auth.signOut()`;
- limpar o estado React;
- limpar referências corporativas locais;
- invalidar o fluxo visual de acesso;
- não depender somente de apagar `localStorage`.

O logout legado BFF permanecerá isolado até a remoção definitiva do fluxo antigo.

## 5. Identidade Microsoft e autorização

### 5.1 Email

O email será utilizado apenas como dado de exibição ou fallback controlado durante a transição. Não será a única chave de autorização definitiva.

### 5.2 Tenant ID e Object ID

O sistema não presumirá que `tid` e `oid` estejam disponíveis diretamente no frontend.

O backend deverá inspecionar os dados de identidade retornados pelo Supabase Auth e aceitar somente campos que tenham sido validados pelo provedor. Possíveis locais a verificar:

- metadados da identidade Microsoft em `auth.identities`;
- claims do token validadas pelo Supabase Auth;
- dados retornados por uma API server-side confiável.

Se a identidade não fornecer `tenant_id` e `object_id` verificáveis, o fluxo deverá permanecer sem provisionamento e sem acesso corporativo privilegiado.

O ambiente corporativo será single-tenant. O backend deverá comparar o claim `tid` com `AZURE_TENANT_ID` configurado no servidor e rejeitar qualquer outro tenant. O claim `oid` será tratado como o identificador imutável do objeto Microsoft dentro do tenant; email não substituirá essa validação.

Quando o provedor retornar `xms_edov`, o backend deverá verificar seu significado de domínio de email validado conforme a documentação do Entra ID. `xms_edov` poderá reforçar a validação do domínio, mas nunca substituirá `tid`, `oid`, assinatura, emissor, audiência, expiração e a pré-autorização interna.

### 5.3 Preparação para `access_preapprovals`

Esta etapa não alterará a tabela nem seus cinco registros.

O contrato futuro deverá permitir:

```text
identidade Microsoft validada
        ↓
access_preapprovals ativo
        ↓
perfil provisionado com id = auth.users.id
```

O provisionamento definitivo será uma etapa posterior, com transação idempotente, auditoria e resolução preferencial por `(microsoft_tenant_id, microsoft_object_id)`.

## 6. Arquivos afetados

### 6.1 Arquivos existentes candidatos a alteração

- `frontend/src/pages/access/EcosystemLogin.tsx`
- `frontend/src/app/routes/AppRoutes.tsx`
- `frontend/src/features/session/DemoSessionProvider.tsx`
- `frontend/src/features/session/ProtectedRoute.tsx`
- `frontend/src/features/session/authGuard.ts`
- `frontend/src/features/session/types.ts`
- `frontend/src/features/auth/authService.ts`
- `api/provision.ts`
- `api/me.ts`
- `api/logout.ts`
- `frontend/package.json`
- `frontend/package-lock.json`
- `.env.example`

As alterações deverão ser limitadas ao necessário para a nova sessão e para impedir caminhos alternativos.

### 6.2 Arquivos novos previstos

- `frontend/src/config/supabaseConfig.ts`
- `frontend/src/features/auth/infrastructure/supabaseAuthClient.ts`
- `frontend/src/features/auth/infrastructure/supabaseSessionService.ts`
- `frontend/src/pages/access/AuthCallbackPage.tsx`
- `api/supabase-session.ts`
- testes unitários e de integração local para os arquivos acima;
- documentação de configuração para TI em `docs/auth/`.

Os caminhos listados são o contrato de implementação desta etapa.

## 7. Segurança

### 7.1 Regras fail-closed

Negar acesso quando:

- não houver sessão Supabase;
- o token estiver ausente, expirado ou inválido;
- o usuário não possuir perfil;
- o perfil estiver inativo;
- o cargo for desconhecido;
- a identidade Microsoft não puder ser validada;
- o tenant não corresponder ao ambiente esperado;
- `tenant_id`/`object_id` forem necessários e não estiverem disponíveis.

### 7.2 Service role

O service role poderá ser usado somente em funções server-side. Não será adicionado a variáveis `VITE_*`, código frontend, testes de navegador ou armazenamento local.

### 7.3 Endpoints legados

Os endpoints `api/login.ts`, `api/redirect.ts`, `api/me.ts`, `api/logout.ts`, `api/provision.ts` e o cliente `api/msal.ts` não poderão autenticar ou autorizar usuários em produção durante a transição. Eles deverão ser protegidos por uma guarda comum que exija ambiente não produtivo e `ENABLE_LEGACY_MSAL=true`; em produção, deverão responder com bloqueio explícito e não criar cookies, sessões ou perfis.

O frontend não poderá chamar esses endpoints como fallback quando o Supabase Auth estiver indisponível. Uma falha do novo fluxo deverá resultar em erro seguro, não em troca silenciosa para MSAL/BFF.

### 7.4 RLS

Não haverá alteração no banco nesta etapa. A implementação deve preservar a premissa de que as políticas RLS usam `auth.uid()` e que `profiles.id` referencia `auth.users.id`.

Qualquer acesso privilegiado usado apenas para resolver o perfil deverá continuar restrito ao servidor e não será tratado como substituto das políticas RLS para as operações de negócio.

## 8. Testes previstos

### Frontend

- cliente Supabase sem configuração não iniciar login silenciosamente;
- `signInWithOAuth` usar o redirect permitido;
- `signInWithOAuth` usar PKCE e os escopos `openid profile email`;
- callback com `code` válido prosseguir para validação;
- callback sem `code` negar acesso;
- callback repetido não trocar o mesmo código duas vezes;
- sessão Supabase ausente redirecionar para o ecossistema;
- sessão expirada ser limpa;
- logout limpar a sessão corporativa;
- cargo desconhecido ser negado;
- sessão demo continuar funcionando;
- sessão demo não acessar o fluxo corporativo;
- conta MSAL ativa sem sessão Supabase não liberar rota protegida.

### Backend

- requisição sem bearer token retornar 401;
- token inválido ou expirado retornar 401;
- usuário Supabase sem perfil retornar 403;
- perfil inativo retornar 403;
- cargo inválido retornar 403;
- autorização permanecer bloqueada quando a integração definitiva não estiver habilitada;
- tentativa de enviar cargo ou email adulterado ser ignorada/rejeitada;
- service role não ser inicializado antes da autenticação;
- tenant diferente do configurado retornar 403;
- `oid` ausente ou `xms_edov` inconsistente retornar 403;
- ausência de `tenant_id`/`object_id` não criar perfil;
- nenhum endpoint novo executar insert de `profiles` nesta etapa.

### Regressão

Executar a suíte existente, lint, typecheck e build. O modo demo, rotas atuais, logout e as correções da Etapa 1 devem continuar aprovados.

## 9. Configuração necessária para TI

A documentação deverá solicitar:

1. tenant ID oficial da SM&A;
2. client ID da aplicação Entra ID;
3. criação do client secret exclusivamente no Supabase Auth;
4. callback do Supabase:
   `https://<project-ref>.supabase.co/auth/v1/callback`;
5. URLs de redirecionamento do frontend, incluindo ambiente local e produção;
6. configuração single-tenant no registro do aplicativo e no Supabase Auth;
7. escopos mínimos `openid`, `profile` e `email`, além de permissões Graph somente se justificadas;
8. URLs autorizadas exatas para callback, local, homologação e produção;
9. política para usuários convidados externos;
10. confirmação de onde serão obtidos e validados `tid` e `oid`;
11. tratamento esperado de `xms_edov` quando presente;
12. procedimento de rotação de segredo;
13. contatos responsáveis pela aprovação e revogação do aplicativo.

Nenhum segredo real será documentado no repositório.

## 10. Migração e rollout

### Fase 1 — preparação local

- adicionar contratos e adaptadores;
- implementar callback e sessão com configurações ausentes de forma segura;
- manter a autorização corporativa bloqueada por padrão;
- bloquear os endpoints MSAL/BFF legados em produção;
- manter demo funcional;
- testar sem Azure real usando mocks controlados.

### Fase 2 — ambiente de homologação

- configurar o provedor Azure no projeto Supabase de teste;
- testar um diretor, um supervisor e um colaborador;
- verificar `auth.users`, sessão, perfil e rotas;
- registrar a presença ou ausência de `tid`, `oid` e `xms_edov`;
- somente habilitar a autorização após validar a pré-autorização e o provisionamento em ambiente de teste.

### Fase 3 — integração com pré-autorização

- revisar os cinco pré-cadastros;
- preencher IDs Microsoft somente após validação independente;
- implementar provisionamento idempotente;
- validar `profiles.id = auth.users.id`;
- executar testes de autorização e RLS.

### Fase 4 — piloto controlado

- ativar somente para usuários aprovados;
- manter legado desabilitado;
- monitorar falhas de callback, logout, expiração e autorização;
- preparar rollback para o fluxo demo, sem usar demo como acesso corporativo.

### Fase 5 — produção

Somente após testes reais com Entra ID, revisão de segurança e autorização explícita para alterações de produção.

## 11. Riscos e decisões pendentes

### Riscos

- O Supabase Auth Azure ainda não está configurado pela TI.
- A disponibilidade de `tid` e `oid` precisa ser confirmada em ambiente de teste.
- O fluxo BFF legado continua no repositório até a migração ser validada.
- Não existe perfil corporativo de produção suficiente para validar a autorização real.
- O endpoint server-side poderá validar a sessão Supabase, mas não deve provisionar usuários nesta etapa.

### Decisões pendentes

- tenant único ou suporte a convidados;
- pré-autorização como controle contínuo ou somente primeiro acesso;
- política de alteração de cargo;
- origem operacional para atribuição de `squad_id`;
- retenção de usuários Auth não autorizados criados pelo OAuth;
- momento de remoção definitiva do MSAL legado.

## 12. Fora do escopo

- alterações no Supabase de produção;
- migrations;
- alteração dos cinco pré-cadastros;
- criação automática de perfis privilegiados;
- deploy, push ou merge;
- implementação de Microsoft Entra ID real sem aprovação da TI;
- mudanças em apontamentos, banco de horas, calendário, layout ou regras de negócio;
- substituição do RLS por autorização somente no frontend.

## 13. Critérios de aceite da Etapa 2

A etapa será considerada pronta para revisão quando:

- o novo fluxo Supabase Auth estiver isolado e coberto por testes;
- não houver fallback corporativo automático para MSAL legado;
- a autorização corporativa permanecer bloqueada até a integração definitiva;
- o modo demo continuar funcionando sem acessar dados corporativos;
- perfis ausentes, inativos e cargos desconhecidos forem negados;
- não houver criação de perfil nesta etapa;
- nenhuma chave service role aparecer no frontend;
- documentação para TI estiver atualizada;
- testes, lint, typecheck e build passarem;
- o relatório declarar explicitamente o que continua dependente do Azure.

Esta especificação não declara o login corporativo pronto para produção.
