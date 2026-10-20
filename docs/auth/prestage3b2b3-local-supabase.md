# Homologação local do Supabase e provisionamento Azure JIT

## Objetivo

Este pacote prepara uma homologação descartável do Supabase Auth, PostgREST/Data API e RLS sem qualquer conexão com o projeto corporativo.

O ambiente usa `supabase/config.toml` local, PostgreSQL 17, migrations versionadas e usuários fictícios criados exclusivamente pela API administrativa local. O `service_role` é obtido somente do `supabase status` do runner e nunca é versionado, impresso ou enviado ao navegador.

## Execução

O workflow `.github/workflows/validate-supabase-local.yml`:

1. instala a versão fixada do Supabase CLI (`2.121.0`);
2. inicia a stack local em containers Docker do runner;
3. executa `supabase db reset --local --no-seed` sobre as migrations versionadas;
4. cria usuários sintéticos no Auth local;
5. cria profiles, squads e apontamentos sintéticos por conexão administrativa local;
6. cria identidades Azure sintéticas pela API Admin local e verifica o provisionamento JIT do trigger;
7. confirma perfil ativo `colaborador`, IDs vinculados ao UUID Auth e leitura do próprio perfil via RLS;
8. verifica que colisão de e-mail é auditada sem vincular o perfil legado e que identidade não Azure não recebe profile;
9. obtém tokens de senha emitidos pelo Auth local e consulta a Data API com esses tokens e com a chave anônima;
10. verifica respostas positivas e negativas de RLS/grants e descarta os containers.

Não há `supabase link`, `db push`, project ref, URL remota, segredo corporativo ou migration remota no workflow.

## Cenários cobertos

- colaborador: somente os apontamentos próprios;
- supervisor: somente a própria squad;
- diretor: visibilidade prevista nas policies sintéticas;
- usuário sem profile: nenhum registro corporativo;
- identidade Azure nova: profile JIT ativo de colaborador com `id = auth_user_id = auth.users.id`;
- identidade Azure com e-mail em colisão: sem vínculo ao profile legado e evento negado auditado;
- identidade não Azure: sem provisionamento automático;
- login Azure repetido para profile de gestor já vinculado: cargo do gestor preservado;
- profile inativo: acesso negado;
- `anon`: nenhuma leitura corporativa;
- alteração direta de `role`/`auth_user_id`: rejeitada;
- `access_preapprovals`: não exposta pela Data API;
- inserção de apontamento para outro profile: rejeitada.

## Limitações e bloqueador local

Nesta máquina, o binário global do Supabase CLI e o Docker não estão instalados. O CLI pode ser invocado via `npx supabase@2.121.0`, mas a stack completa não pode ser iniciada localmente sem um runtime Docker.

Por isso, esta entrega prepara a execução real no GitHub Actions, mas não declara homologação local concluída até o workflow ser executado com sucesso. PostgreSQL sintético continua sendo evidência diferente da homologação completa do Supabase gerenciado.

O trigger confia exclusivamente em `auth.users.raw_app_meta_data.provider = 'azure'`, e só provisiona e-mails confirmados. Ele nunca usa `user_metadata.role`, não promove cargos e não associa profiles somente por e-mail. O endpoint de sessão ainda valida a identidade Azure e o profile ativo antes de liberar a aplicação.

Antes de produção, configure o provedor Azure do Supabase para aceitar somente o tenant corporativo SM&A e valide a migração num ambiente de homologação. Não aplique esta migration diretamente à produção sem essa configuração e revisão operacional.

Também permanecem fora desta etapa:

- Microsoft Entra ID real;
- configuração Azure;
- autorização definitiva baseada em `access_preapprovals`;
- homologação em Supabase gerenciado;
- alterações em produção.

Não há segredo de Service Role no frontend. A sincronização de perfil passa pelo endpoint `/api/supabase-session`, usando o token autenticado e uma consulta com RLS.
