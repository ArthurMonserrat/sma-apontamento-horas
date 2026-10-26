# Unificação de persistência dos Bancos de Horas

## Intenção

Levar a persistência compartilhada dos Bancos de Horas para o PostgreSQL do Supabase, preservando a identidade corporativa em `public.profiles` e eliminando a dependência de `localStorage` no runtime autenticado.

## Escopo desta primeira entrega

- Criar uma área `banco2` no mesmo Postgres do Supabase.
- Usar `public.profiles.id` como vínculo do autor dos registros do Banco 2.
- Persistir apontamentos do Banco 2 no Supabase com RLS por colaborador, squad e diretoria.
- Manter o Prisma apenas como ferramenta de acesso compatível ao Postgres; a identidade e a autorização não serão duplicadas em uma tabela local de usuários.
- Manter fixtures e serviços locais somente para testes e demonstração explícita.

Ficam para entregas posteriores: ausências, jornadas, avisos, auditoria completa e relatórios unificados.

## Abordagens consideradas

1. **Prisma em um schema `banco2` do Supabase (escolhida para o modelo de dados)** — preserva o domínio existente e permite rollback, mas exige que as chamadas autenticadas usem a Data API ou um BFF com autorização rigorosa; uma conexão administrativa direta não deve ser tratada como substituta de RLS.
2. **Migrar tudo para tabelas públicas compartilhadas** — simplifica relatórios, mas mistura contratos de campos diferentes e aumenta o risco de regressão do Banco 1.
3. **Manter Neon e sincronizar depois** — rejeitada porque duplica identidade, autorização e relatórios enquanto o banco está vazio.

## Contrato de segurança

- A sessão Supabase continua sendo a autoridade de identidade.
- `profile_id` vem da sessão validada no servidor; o cliente não escolhe outro perfil.
- Cargo, squad e acesso ao Banco 2 vêm de `public.profiles` e `public.profile_module_access`.
- RLS permanece habilitado no schema `banco2`.
- Nenhum `service_role` chega ao navegador.
- Nenhuma migration remota ou alteração de dados reais será executada nesta entrega.

## Critério de sucesso

Um apontamento criado por uma sessão corporativa autorizada deve persistir no Supabase e sobreviver a logout, novo login e troca de dispositivo; usuários sem vínculo, de outra squad ou anônimos devem receber zero linhas ou erro de autorização.
