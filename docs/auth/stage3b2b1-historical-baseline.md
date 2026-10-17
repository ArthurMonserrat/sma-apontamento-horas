# Pré-Etapa 3B.2B.1 — baseline histórico

## Resultado

A migration recuperada `20261010215524_create_initial_workforce_time_tracking_schema.sql` é uma cópia fiel do SQL registrado em `supabase_migrations.schema_migrations`. O checksum MD5 permanece `4ef1871ed3cd19181bdd0b7a30ac6130`.

O cenário histórico foi executado em PostgreSQL 15 descartável. A estrutura, funções, grants e definições de policies passaram nas assertions. A aplicação direta da migration `20261016210000_stage3b1_identity_foundation.sql` falha especificamente com SQLSTATE `42P01`, porque `public.access_preapprovals` não existe no histórico original. Essa incompatibilidade é esperada e comprovada; não é compatibilidade aprovada.

O cenário legado sintético, que inclui `access_preapprovals` e representa o schema posterior observado, aplica e reaplica a 3B.1 com sucesso e preserva os registros sintéticos.

## Limites

As assertions verificam DDL, constraints, índices, privilégios, RLS habilitado e existência de policies. Elas não comprovam o comportamento de filtragem sob os papéis `anon`/`authenticated`, o isolamento real entre squads, o Supabase Auth, a Data API ou a configuração gerenciada do projeto. A homologação integral permanece fora deste workflow e deve ser tratada na etapa de RLS, em ambiente Supabase isolado.

## Schema drift e decisão pendente

O histórico original não cria `access_preapprovals`, enquanto o estado legado posterior depende dela e apresenta alterações estruturais em `profiles`. Portanto, bancos novos ainda não são reproduzíveis integralmente apenas com as migrations versionadas.

Antes de qualquer aplicação remota, é necessária uma decisão administrativa entre:

1. **Baseline estrutural sanitizado:** versionar uma reconstrução controlada do estado posterior, sem dados reais, e aplicar a 3B.1 depois dela.
2. **Migration intermediária explícita:** criar uma migration futura para introduzir somente os objetos ausentes e compatibilizar o baseline histórico, após revisão de FKs, tipos, policies e perfis legados.
3. **Baseline externo documentado:** manter o histórico remoto como dependência declarada e usar a 3B.1 somente em bases que já possuam o contrato legado compatível.

Nenhuma alternativa foi implementada neste PR, e nenhuma altera o histórico remoto ou os dados de produção.
