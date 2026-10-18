# Pré-Etapa 3B.2B.3 — homologação local do Supabase

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
6. obtém tokens de senha emitidos pelo Auth local;
7. consulta a Data API local com esses tokens e com a chave anônima;
8. verifica respostas positivas e negativas de RLS/grants;
9. encerra e descarta os containers.

Não há `supabase link`, `db push`, project ref, URL remota, segredo corporativo ou migration remota no workflow.

## Cenários cobertos

- colaborador: somente os apontamentos próprios;
- supervisor: somente a própria squad;
- diretor: visibilidade prevista nas policies sintéticas;
- usuário sem profile: nenhum registro corporativo;
- profile inativo: acesso negado;
- `anon`: nenhuma leitura corporativa;
- alteração direta de `role`/`auth_user_id`: rejeitada;
- `access_preapprovals`: não exposta pela Data API;
- inserção de apontamento para outro profile: rejeitada.

## Limitações e bloqueador local

Nesta máquina, o binário global do Supabase CLI e o Docker não estão instalados. O CLI pode ser invocado via `npx supabase@2.121.0`, mas a stack completa não pode ser iniciada localmente sem um runtime Docker.

Por isso, esta entrega prepara a execução real no GitHub Actions, mas não declara homologação local concluída até o workflow ser executado com sucesso. PostgreSQL sintético continua sendo evidência diferente da homologação completa do Supabase gerenciado.

Também permanecem fora desta etapa:

- Microsoft Entra ID real;
- configuração Azure;
- provisionamento corporativo;
- autorização definitiva baseada em `access_preapprovals`;
- homologação em Supabase gerenciado;
- alterações em produção.

`CORPORATE_AUTHORIZATION_IMPLEMENTED=false`, `/api/provision` e `/api/supabase-session` permanecem bloqueados conforme o contrato aprovado.
