# Calendário Gerencial com Filtros — Plano de Implementação

> Implementar as tarefas na ordem neste mesmo checkout. As mudanças ficam locais na `main`; não publicar nem enviar alterações ao remoto.

**Goal:** Adicionar calendário gerencial com filtro por colaborador na supervisão e filtros por equipe/colaborador na diretoria.

**Architecture:** `MonthlyCalendar` continua responsável pela grade e navegação. `ManagerCalendar` filtra as entradas do Banco 1 e apresenta os detalhes; `supervisorService` preserva os metadados de equipe e detalhamento já gravados para a Diretoria.

**Tech Stack:** React, TypeScript, Vite, componentes e serviços existentes no frontend.

**Spec:** [2026-10-04-calendario-gerencial-filtros-design.md](../specs/2026-10-04-calendario-gerencial-filtros-design.md)

## Global Constraints

- Mudanças apenas em `sma-apontamento-horas`.
- Relação histórica com a equipe baseada em `assignmentSnapshot`.
- Sem alteração nos fluxos de persistência, permissões, aprovação e telas do colaborador.
- Sem push ao remoto.

## Review Focus

- `assignmentSnapshot` nulo ou legado deve aparecer em “Sem equipe” e em “Todas as equipes”.
- Snapshot de equipe inativa deve permanecer filtrável.
- Vários apontamentos no mesmo dia devem aparecer na prévia sem duplicar totais.
- Mudança de equipe deve limpar colaborador e prévia.
- Datas futuras e fins de semana devem manter os estados e totais definidos na especificação.

### Tarefa 1: Preservar metadados gerenciais

**Arquivos:** `frontend/src/features/supervisor/types.ts`, `frontend/src/services/supervisorService.ts`.

- Acrescentar campos opcionais de detalhamento e `assignmentSnapshot` ao tipo de entrada gerencial.
- Projetar esses campos a partir dos registros persistidos em `listEntries()` sem inventar associação para dados sem snapshot.
- Resultado esperado: supervisão e diretoria recebem a mesma entrada atual e a Diretoria consegue identificar equipe histórica quando há snapshot.

### Tarefa 2: Criar calendário gerencial compartilhado

**Arquivos:** criar `frontend/src/features/calendar/ManagerCalendar.tsx`; modificar `frontend/src/features/calendar/MonthlyCalendar.tsx`.

- Adicionar ao calendário mensal suporte opcional a rótulo/prévia gerencial no clique, sem alterar o comportamento do calendário individual.
- Implementar seletores de colaborador e, somente para Diretoria, equipe e “Sem equipe”.
- Calcular totais diários das entradas filtradas; atualizar filtro de colaborador em cascata; ordenar opções.
- Abrir prévia somente de leitura com todos os registros visíveis da data. Fechar a prévia ao mudar filtros.

### Tarefa 3: Integrar às telas de gestão

**Arquivos:** `frontend/src/pages/SupervisorPage.tsx`, `frontend/src/pages/DiretoriaPage.tsx`.

- Renderizar `ManagerCalendar` na área principal da Supervisão com entradas e colaboradores carregados pelo dashboard.
- Carregar entradas gerenciais e equipes de `squadService` para a Diretoria; manter equipes históricas presentes nos snapshots.
- Renderizar o calendário no painel da Diretoria com os dados carregados, sem interferir nos indicadores ou aprovações existentes.

### Tarefa 4: Verificação de compilação

- Executar `npm --prefix frontend run typecheck` e `npm --prefix frontend run build`.
- Corrigir erros de compilação introduzidos pela mudança e conferir `git diff --check`.
- Não executar testes automatizados neste pedido.
