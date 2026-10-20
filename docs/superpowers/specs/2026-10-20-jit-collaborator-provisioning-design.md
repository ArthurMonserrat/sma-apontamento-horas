# Especificação de design — provisionamento JIT de colaboradores

**Status:** especificação para revisão do usuário; implementação ainda não autorizada
**Branch:** `codex/jit-provision-spec`
**Base:** `e081091760009308f75dbcd385c35a87e00e335b`
**Data:** 2026-10-20

## 1. Objetivo

Permitir que uma identidade que concluiu autenticação Microsoft pelo Supabase Auth entre no sistema como `colaborador` quando ainda não possuir perfil corporativo. A role será concedida pelo banco, nunca pelo navegador ou por metadados editáveis do usuário. Perfis já existentes mantêm seus cargos e vínculos.

Fluxo desejado:

```text
Microsoft Entra ID (Azure configurado no Supabase)
        ↓
Supabase Auth cria auth.users
        ↓ trigger confiável e idempotente
public.profiles com role = colaborador
        ↓ sessão restaurada e perfil carregado
estado React autorizado somente com perfil ativo
        ↓
rotas protegidas e RLS existentes
```

O escopo não reintroduz MSAL Browser nem OAuth Supabase paralelo. O fluxo Microsoft atualmente usado pela aplicação continua sendo Supabase Auth.

## 2. Estado atual auditado

- `DemoSessionProvider` classifica qualquer sessão Supabase como `authenticated_unauthorized`, mesmo quando válida.
- `authGuard.hasAuthenticatedSession` só aceita sessão explicitamente demo; portanto uma sessão Supabase não libera rota.
- `AuthSync` é atualmente um wrapper sem sincronização.
- `public.profiles.id` referencia `auth.users.id`; `email` e `full_name` são obrigatórios; `role` usa `public.app_role` (`colaborador`, `supervisor`, `diretor`); `active` tem default `true`.
- A fundação de identidade também contém `profiles.auth_user_id`, com índice único parcial. `private.current_profile_id()` e helpers de RLS procuram `profiles.auth_user_id = auth.uid()`.
- Há arquitetura anterior de pré-aprovação (`access_preapprovals`) e auditoria, mas a nova regra aprovada substitui a exigência de pré-cadastro para entrada padrão como colaborador. Ela não autoriza promover cargos.
- A aplicação usa RLS para autorização de dados. O client Supabase usa chave pública anon; nenhuma service-role pode ir para o bundle.

## 3. Decisões de arquitetura

### 3.1 Provisionamento no banco

Um trigger `AFTER INSERT ON auth.users` chama função `SECURITY DEFINER` no schema `private`. A função:

1. só provisiona usuários cuja origem autenticada seja o provedor Microsoft Azure (`raw_app_meta_data.provider`/identidade confirmada como `azure`); outros provedores não recebem perfil por este caminho;
2. não usa `user_metadata.role`, cargo enviado por cliente, e-mail para vincular identidade, nem claims não verificadas;
3. cria um perfil com `id = NEW.id`, `auth_user_id = NEW.id`, e-mail normalizado, nome validado com fallback determinístico, `role = 'colaborador'`, `active = true` e `squad_id = NULL`;
4. é idempotente para repetição da mesma identidade e não altera role, nome, squad ou status de perfil existente;
5. não eleva privilégio nem converte uma linha existente localizada somente por e-mail em identidade autenticada;
6. restringe execução direta da função, fixa `search_path` seguro e concede somente as permissões necessárias ao trigger;
7. registra falhas e colisões sem guardar tokens, segredos ou dados sensíveis desnecessários.

O `id = NEW.id` e `auth_user_id = NEW.id` são intencionais: satisfazem a FK existente e os helpers atuais de RLS ao mesmo tempo.

### 3.2 Dados incompletos e colisões

`profiles.email` e `profiles.full_name` são obrigatórios. O trigger usa claims de e-mail/nome fornecidas pelo Supabase Auth e validadas pelo provedor, normaliza o e-mail e aplica fallback não vazio ao nome. Se o provedor Azure não fornecer e-mail utilizável, ou se o e-mail já estiver associado a outro perfil, não se deve anexar nem sobrescrever esse perfil por correspondência de e-mail. O evento é registrado para reconciliação, e a sessão não é autorizada sem perfil correspondente. Falhas esperadas de dados/colisão devem ser auditadas e deixar o usuário sem perfil; falhas inesperadas de banco devem abortar a transação com erro observável, em vez de aparentar sucesso sem perfil. O frontend deve converter ambos os cenários em estado de erro recuperável, nunca em tela branca nem autorização em memória.

### 3.3 Fronteira do tenant

“Microsoft login” deve significar a organização SM&A, não qualquer conta Microsoft. O Supabase Auth/Azure deve estar configurado para o tenant corporativo específico. O rollout deve verificar a URL de tenant e o comportamento para convidados externos. Até isso ser confirmado, o JIT não pode ser considerado restrito à organização. Não se adiciona `SUPABASE_SERVICE_ROLE_KEY` ao frontend nem se abre RLS para `anon`.

### 3.4 Restauração e autorização no frontend

O provider de sessão trata `getSession()` e `onAuthStateChange` de forma idempotente. Quando há sessão Supabase:

1. mantém as rotas em loading enquanto consulta o perfil autenticado;
2. busca o perfil por `auth_user_id = session.user.id` (ou pelo endpoint server-side já existente, desde que derive a identidade do token validado e retorne o mesmo contrato);
3. só considera autorizado um perfil único, ativo e com role reconhecida;
4. converte a role do banco para a role interna do app; a role vem exclusivamente do perfil;
5. não faz fallback em memória para `COLLABORATOR` caso o perfil esteja ausente, inativo, duplicado ou inválido;
6. mantém sessões demo separadas e sem acesso a dados corporativos.

`ProtectedRoute` e o guard devem aceitar sessão corporativa somente quando acompanhada de perfil corporativo validado e ativo. Sessão ausente/expirada retorna ao Ecossistema; sessão válida sem perfil mostra erro recuperável e nega acesso, sem loop infinito. Logout limpa sessão e perfil.

## 4. Escopo de implementação posterior

- Nova migration Supabase para função privada, trigger e, se necessário, reconciliação idempotente apenas de usuários Azure existentes sem perfil.
- Ajustes em `DemoSessionProvider`, tipos/contexto, `authGuard` e `ProtectedRoute` para representar o perfil Supabase autorizado sem enfraquecer o isolamento demo/corporativo.
- Serviço de leitura do perfil autenticado, usando RLS ou endpoint atual validado; nenhum payload do cliente define role.
- Testes SQL/automatizados e testes de frontend para estados loading, autorizado, não autorizado e logout.
- Documentação operacional para tenant Azure, execução da migration e observação de falhas.

## 5. Fora de escopo

- Conceder `supervisor` ou `diretor` automaticamente.
- Abrir políticas RLS para `anon` ou confiar em roles guardadas em `localStorage`.
- Vincular perfis existentes apenas pelo e-mail, importar cargos ou alterar squads existentes.
- Expor service-role, client secret, tokens OAuth ou credenciais em código público.
- Alterar o fluxo de login para MSAL Browser, adicionar BFF novo sem necessidade, ou mudar rotas funcionais além da liberação controlada.
- Aplicar migrations diretamente no Supabase de produção, deploy, push ou merge.

## 6. Estratégia de testes e critérios de aceite

### Banco

- Primeiro login Azure cria exatamente um perfil colaborador ativo, associado ao mesmo `auth.users.id` em `id` e `auth_user_id`.
- Repetição/reexecução não duplica perfil nem altera role/dados existentes.
- Claims ou metadados de usuário tentando fornecer `supervisor`/`diretor` são ignorados.
- Outro provedor não aciona esse JIT.
- E-mail ausente/inválido e colisão com perfil preexistente não vinculam identidade por e-mail nem concedem acesso indevido; deixam registro auditável e comportamento definido.
- RLS e helpers resolvem o perfil recém-criado e continuam negando acesso a outros usuários.
- A função não pode ser invocada diretamente por `anon`/`authenticated`.

### Frontend

- `getSession` e evento inicial da subscription não disparam carregamentos concorrentes que sobrescrevem estado.
- Enquanto o perfil carrega, `ProtectedRoute` mostra loading.
- Perfil ativo de role conhecida libera apenas rotas permitidas.
- Perfil ausente/inativo/role desconhecida não vira colaborador em memória e não libera rotas.
- Demo continua funcional somente em modo demo e não é promovida a sessão corporativa.
- Logout e sessão expirada limpam sessão e perfil.

### Verificação

Executar testes direcionados, suíte frontend, lint, typecheck, build e `git diff --check`. Validar migration em banco Supabase local/de teste antes de qualquer produção.

## 7. Rollout e segurança

1. Confirmar que Azure no Supabase está restrito ao tenant SM&A e que o provider reporta `azure` em `raw_app_meta_data.provider`.
2. Aplicar migration primeiro em ambiente de teste e criar um usuário Microsoft novo.
3. Validar a relação de identidade, RLS, nome/e-mail, role e logs sem tokens.
4. Testar um perfil novo, um perfil existente privilegiado, e-mail duplicado, usuário sem e-mail e provedor não Azure.
5. Só então publicar frontend e migration em produção com rollback documentado.

O trigger é parte crítica do fluxo de criação de `auth.users`; erros devem ser observáveis e testados. Falhas esperadas de provisionamento deixam a identidade sem autorização e registram motivo auditável; falhas inesperadas abortam a criação de forma explícita. A UI apresenta instrução de recuperação em ambos os casos, sem tela branca.

## 8. Questões a validar antes do plano de implementação

1. Confirmar o valor real de `raw_app_meta_data.provider` para Microsoft no projeto Supabase usado em produção.
2. Confirmar se o trigger deve provisionar apenas novos logins ou também perfis ausentes de usuários Azure já existentes; a proposta prevê backfill restrito, idempotente e apenas para Azure, após auditoria.
3. Confirmar a política operacional para colisões de e-mail com perfis antigos: reconciliação manual, sem auto-link por e-mail.
4. Confirmar se o acesso Microsoft está limitado ao tenant corporativo SM&A, inclusive para contas convidadas.

## 9. Registro da aprovação

O usuário aprovou a direção arquitetural de provisionamento JIT como colaborador com validação de perfil no frontend. Este documento formaliza o desenho para revisão. A aprovação da implementação será solicitada separadamente após o usuário revisar esta especificação.
