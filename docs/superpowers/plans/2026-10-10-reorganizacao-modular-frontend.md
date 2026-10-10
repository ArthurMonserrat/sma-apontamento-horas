# Reorganização Modular do Frontend — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar o frontend em um monólito modular com responsabilidades explícitas, preservando integralmente rotas, comportamento, contratos de domínio, dados locais e aparência.

**Architecture:** A migração será mecânica e incremental: primeiro cria guardas arquiteturais, depois move infraestrutura e UI compartilhadas, composição da aplicação, páginas por área e fixtures demonstrativas. Serviços de negócio serão realocados por domínio em fatias independentes, sem alterar regras ou formatos persistidos. Cada etapa deve deixar testes, lint, TypeScript e build aprovados.

**Tech Stack:** React 19, TypeScript, Vite 8, React Router 7, Vitest, Oxlint, Tailwind CSS 4.

**Spec:** `docs/architecture/project-structure-review.md`

## Global Constraints

- Não alterar comportamento funcional, layout, rotas públicas ou textos visíveis.
- Não alterar chaves, versões ou payloads do localStorage/IndexedDB.
- Não alterar autenticação, autorização, aprovações, saldo, jornada ou modo offline nesta reorganização.
- Não instalar dependências nem alterar versões.
- Preservar co-localização de testes com o código movido.
- Usar `git mv` para preservar histórico e revisar cada conjunto como renomeação.
- Não criar diretórios vazios nem implementar módulos futuros (`projects`, backend ou banco de dados).
- Fazer um commit lógico somente após cada fatia passar nas validações relacionadas.

## Review Focus

- Deep links continuam renderizando as mesmas páginas após mover `pages/`.
- Lazy loading ou alteração de chunking não faz parte desta etapa; o bundle deve manter o comportamento atual.
- Imports de tipos não podem criar ciclos entre módulos após mover services.
- Testes e mocks devem usar as mesmas fixtures públicas, sem duplicar dados demonstrativos.
- Nenhuma movimentação pode alterar a chave `apontamentos_sma`, as chaves versionadas ou o conteúdo migrado.

---

## Estrutura entregue nesta fase

```text
frontend/src/
├── app/
│   ├── layouts/
│   ├── providers/
│   ├── routes/
│   └── App.tsx
├── pages/
│   ├── access/
│   ├── collaborator/
│   ├── supervisor/
│   └── administration/
├── features/                    # módulos existentes preservados
├── shared/
│   ├── infrastructure/storage/
│   ├── lib/date/
│   └── ui/
├── demo/fixtures/
├── styles/
├── assets/
└── main.tsx
```

Os services de domínio migram para `features/<módulo>/infrastructure` apenas quando a fatia tiver testes próprios. `services/` permanece temporariamente para integrações ainda não migradas; removê-lo inteiro não é meta desta entrega.

### Task 1: Guardas arquiteturais e baseline reproduzível

**Files:**
- Create: `frontend/src/app/architecture.test.ts`
- Modify: `package.json`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: estrutura atual e scripts Vitest existentes.
- Produces: scripts explícitos `test:api`, `test:frontend` e teste de fronteiras que bloqueia regressões após as movimentações.

- [ ] **Step 1: Registrar o baseline atual**

Executar: `npm --prefix frontend test -- --reporter=dot`, `npm test -- api`, `npm --prefix frontend run lint`, `npm --prefix frontend run typecheck`, `npm run typecheck`, `npm --prefix frontend run build`.

Esperado: 341 testes frontend e 6 testes API aprovados na revisão `f815522`; ajustar expectativa à revisão corrente sem aceitar regressões silenciosas.

- [ ] **Step 2: Escrever o teste arquitetural inicialmente falho**

O teste `architecture.test.ts` deve verificar, usando caminhos do próprio repositório, que após a migração:

- UI compartilhada não importa de `features` ou `pages`;
- `shared` não importa de `features`, `pages`, `demo` ou `app`;
- páginas não importam arquivos internos de outras páginas;
- diretórios legados movidos nesta fase não reaparecem.

Executar: `npm --prefix frontend test -- src/app/architecture.test.ts`.

Esperado: FAIL enquanto os diretórios legados ainda existem.

- [ ] **Step 3: Delimitar scripts sem instalar dependências**

Na raiz, definir `test:api` como `vitest run api` e `test:frontend` delegando ao frontend. Manter `test` compatível, mas fazê-lo executar explicitamente ambos em sequência, evitando a descoberta cruzada que atualmente falha por `jsdom`.

- [ ] **Step 4: Validar scripts isolados**

Executar: `npm run test:api` e `npm run test:frontend -- --reporter=dot`.

Esperado: PASS em ambos; a raiz não tenta carregar testes DOM pelo Vitest raiz.

- [ ] **Step 5: Commit**

`test(arquitetura): delimitar suites e fronteiras modulares`

### Task 2: Infraestrutura e utilitários compartilhados

**Files:**
- Move: `frontend/src/services/storage.ts` → `frontend/src/shared/infrastructure/storage/browserStorage.ts`
- Move: `frontend/src/services/storage.test.ts` → `frontend/src/shared/infrastructure/storage/browserStorage.test.ts`
- Move: `frontend/src/shared/utils/date.ts` → `frontend/src/shared/lib/date/index.ts`
- Move: `frontend/src/shared/utils/date.test.ts` → `frontend/src/shared/lib/date/index.test.ts`
- Modify: todos os consumidores desses dois módulos.

**Interfaces:**
- Consumes: `StorageLike`, `createResilientStorage`, `createBrowserStorage` e exports atuais de data.
- Produces: exatamente os mesmos símbolos e comportamento nos novos caminhos.

- [ ] **Step 1: Mover storage e atualizar imports sem alterar implementação**

Usar `git mv`; preservar as assinaturas públicas e atualizar todos os imports encontrados por `rg`.

- [ ] **Step 2: Executar testes focados de storage**

Executar: `npm --prefix frontend test -- src/shared/infrastructure/storage/browserStorage.test.ts`.

Esperado: PASS, incluindo fallback quando storage lança.

- [ ] **Step 3: Mover utilitários de data e atualizar imports**

Usar `git mv`; preservar todos os exports existentes no novo `index.ts`.

- [ ] **Step 4: Executar testes focados e TypeScript**

Executar: `npm --prefix frontend test -- src/shared/lib/date/index.test.ts` e `npm --prefix frontend run typecheck`.

Esperado: PASS.

- [ ] **Step 5: Commit**

`refactor(shared): organizar storage e utilitarios de data`

### Task 3: UI compartilhada e layouts da aplicação

**Files:**
- Move to `frontend/src/shared/ui/`: `BrandMark`, `ConfirmDialog`, `InstallAppButton`, `NavigationIcon`, `PageContainer`, `StatusBadge`, `ThemeToggle` e respectivos testes diretamente associados.
- Move to `frontend/src/app/layouts/`: `AppLayout`, `GestorLayout`, `Header`, `Sidebar`, `DirectorSidebar`, `drawer`.
- Move to `frontend/src/app/providers/`: `ThemeProvider`, `themeContext`, `OnboardingTour`, `tourContext`.
- Move: `frontend/src/hooks/useTheme.ts` → `frontend/src/app/providers/useTheme.ts`.
- Modify: imports dos consumidores e `layout.test.tsx`/`SidebarIcons.test.tsx`.

**Interfaces:**
- Consumes: props e contexts existentes.
- Produces: os mesmos componentes, hooks e comportamento visual em caminhos coerentes.

- [ ] **Step 1: Mover UI genérica e atualizar imports**

Não mover `OfflineStatusIndicator`: pertence à feature offline e será tratado na Task 7. Não alterar classes CSS ou props.

- [ ] **Step 2: Executar testes de UI compartilhada**

Executar os testes de `BrandMark`, `StatusBadge` e componentes de interface que os consomem.

Esperado: PASS, sem mudança de markup esperada.

- [ ] **Step 3: Mover layouts e providers e atualizar imports**

Manter a configuração de navegação separada de componentes de shell. Preservar nomes exportados durante esta fase.

- [ ] **Step 4: Executar testes estruturais de layout**

Executar: `npm --prefix frontend test -- src/app/layouts/layout.test.tsx src/app/layouts/SidebarIcons.test.tsx src/app/App.test.tsx`.

Esperado: PASS para Colaborador, Supervisor e Direção.

- [ ] **Step 5: Commit**

`refactor(app): separar layouts providers e ui compartilhada`

### Task 4: Rotas e páginas por área

**Files:**
- Move: `frontend/src/app/AppRoutes.tsx` → `frontend/src/app/routes/AppRoutes.tsx`
- Move: testes de rotas para `frontend/src/app/routes/`.
- Move to `pages/access/`: `EcosystemLogin`, `ecosystemModules`, `Portal`, `ProfileSelectionPage`, `DemoAreaPlaceholderPage` e testes.
- Move to `pages/collaborator/`: `ColaboradorPage`, `NovoApontamentoPage`, `HistoricoPage`, `FolgasPage`, `PerfilPage` e testes.
- Move to `pages/supervisor/`: `SupervisorPage`.
- Move to `pages/administration/`: `DiretoriaPage`, `EquipesPage`, `RelatoriosPage`, `AvisosPage`.
- Modify: imports e referências de teste.

**Interfaces:**
- Consumes: componentes de página existentes e mesmos paths React Router.
- Produces: `AppRoutes` com a mesma tabela de rotas e páginas agrupadas por área de acesso.

- [ ] **Step 1: Criar um teste de equivalência da tabela de rotas**

Cobrir `/`, `/selecao-perfil`, `/portal`, rotas do Colaborador, `/supervisor`, `/administracao`, equipes, relatórios, avisos e fallback. Testar papéis permitidos pelas rotas, sem testar implementação interna do guard.

- [ ] **Step 2: Mover páginas de acesso e Colaborador**

Usar `git mv`, atualizar imports e executar testes das páginas movidas.

- [ ] **Step 3: Mover páginas gerenciais e rotas**

Usar `git mv`, atualizar imports e manter URLs e query strings existentes.

- [ ] **Step 4: Validar rotas e navegação**

Executar testes de rotas, `ProtectedRoute`, políticas de sessão, layout e páginas movidas.

Esperado: PASS e nenhuma alteração de rota pública.

- [ ] **Step 5: Commit**

`refactor(pages): agrupar telas por area de acesso`

### Task 5: Dados demonstrativos isolados

**Files:**
- Move: `frontend/src/mocks/demoData.ts` → `frontend/src/demo/fixtures/demoData.ts`
- Move: `frontend/src/mocks/navigation.ts` → `frontend/src/demo/fixtures/navigation.ts`
- Move: `frontend/src/data/mockDEP.ts` → `frontend/src/demo/fixtures/mockDEP.ts`
- Modify: todos os consumidores.

**Interfaces:**
- Consumes: fixtures e tipos atualmente exportados.
- Produces: os mesmos dados em namespace explicitamente demonstrativo.

- [ ] **Step 1: Mover fixtures sem alterar valores**

Comparar hashes/conteúdo antes e depois; somente imports mudam.

- [ ] **Step 2: Atualizar consumidores e impedir fallback cruzado**

Nesta tarefa, “impedir” significa somente que produção importa caminhos `demo/fixtures` explicitamente; não alterar ainda os fallbacks funcionais.

- [ ] **Step 3: Executar testes de sessão, perfil, supervisão, relatórios e equipes**

Esperado: PASS com os mesmos IDs, nomes e squads demonstrativos.

- [ ] **Step 4: Commit**

`refactor(demo): isolar fixtures da aplicacao`

### Task 6: Infraestrutura de apontamentos e aprovações junto aos módulos

**Files:**
- Move to `features/time-entries/infrastructure/`: `timeEntryService.ts`, `timeEntryService.test.ts`, `timeEntryMigration.ts`.
- Move to `features/approvals/infrastructure/`: `dayApprovalService.ts`, `dayApprovalService.test.ts`, `entryDateAvailabilityService.ts`.
- Modify: imports dos consumidores e entre módulos.
- Create: `frontend/src/features/time-entries/index.ts`
- Create: `frontend/src/features/approvals/index.ts`

**Interfaces:**
- Consumes: todos os contratos atuais, chaves de storage e tipos de domínio.
- Produces: APIs públicas que reexportam somente contratos e instâncias necessários aos consumidores atuais.

- [ ] **Step 1: Criar testes que fixam chaves e contratos públicos**

Confirmar `TIME_ENTRY_STORAGE_KEY === 'apontamentos_sma'`, chaves legadas, assinaturas CRUD e comportamento de políticas de mutação.

- [ ] **Step 2: Mover infraestrutura de apontamentos com testes**

Não renomear tipos, storage keys, classes ou métodos. Atualizar imports internos e consumidores para a API pública do módulo quando não causar ciclo.

- [ ] **Step 3: Mover infraestrutura de aprovação com testes**

Preservar a separação funcional atual; a unificação das duas autoridades de aprovação é tarefa futura, explicitamente fora desta reorganização.

- [ ] **Step 4: Executar suites completas desses domínios e TypeScript**

Esperado: testes de migração, CRUD, versão, bloqueios e aprovação aprovados.

- [ ] **Step 5: Commit**

`refactor(domain): aproximar adaptadores de apontamentos e aprovacoes`

### Task 7: Realocar integrações de módulos restantes

**Files:**
- Move services de perfil/squad para `features/profile/infrastructure` e/ou `features/squads/infrastructure`, mantendo ownership explícito.
- Move services de carga para `features/workloads/infrastructure`.
- Move services de ausência para `features/time-off/infrastructure`.
- Move services de calendário/feriados para `features/calendar/infrastructure`.
- Move services de avisos/notificações para `features/announcements/infrastructure`.
- Move auditoria para `features/audit/infrastructure`.
- Move fila e indicador offline para `features/offline/infrastructure` e `features/offline/ui`.
- Move exportador/diretoria para `features/reports/infrastructure`.
- Keep temporarily: `frontend/src/services/postCommit.ts`, até haver owner inequívoco em `shared/infrastructure` ou domínio.

**Interfaces:**
- Consumes: services existentes com suas suites.
- Produces: adaptadores co-localizados, sem modificar regra, formato ou singleton exportado.

- [ ] **Step 1: Migrar um módulo por vez**

Para cada módulo: mover implementação e teste, atualizar imports, executar sua suite, executar TypeScript. Não agrupar correções comportamentais encontradas.

- [ ] **Step 2: Criar APIs públicas apenas quando houver mais de um consumidor externo**

Evitar barrels globais e exports indiscriminados. `shared` não pode importar `features`.

- [ ] **Step 3: Executar o teste arquitetural**

Esperado: PASS para imports e ausência dos diretórios legados definidos na Task 1.

- [ ] **Step 4: Commit por conjunto coeso**

Usar mensagens `refactor(<modulo>): co-localizar infraestrutura de <dominio>`; não acumular todos os módulos num commit único.

### Task 8: Documentação, revisão e validação final

**Files:**
- Modify: `frontend/README.md`
- Modify: `docs/architecture/project-structure-review.md` somente para registrar fase realizada, sem apagar achados pendentes.
- Modify: este plano, marcando tarefas executadas.

**Interfaces:**
- Consumes: estrutura final real.
- Produces: mapa preciso de responsabilidades e comandos atuais.

- [ ] **Step 1: Atualizar árvore e ownership documental**

Documentar que `demo/fixtures` não é fonte corporativa; pages compõem; features possuem negócio; shared não conhece features; app conecta providers/layouts/rotas.

- [ ] **Step 2: Executar validação completa**

Executar: `npm run test:api`, `npm run test:frontend -- --reporter=dot`, lint frontend, typecheck raiz/frontend, build frontend e `git diff --check`.

Esperado: todas as verificações aprovadas; nenhum arquivo gerado versionado; quantidade de testes sem regressão.

- [ ] **Step 3: Revisar diff como reorganização**

Confirmar `git diff --summary` majoritariamente como renames; procurar alterações em strings, storage keys, rotas, tipos persistidos, CSS e manifests. Qualquer alteração comportamental deve sair desta série ou receber tarefa/teste próprios.

- [ ] **Step 4: Smoke test manual**

Verificar desktop/mobile e claro/escuro: entrada, seleção de perfil, cada sidebar, dashboard, novo apontamento, histórico, perfil, Supervisor e Administração. Recarregar deep links principais.

- [ ] **Step 5: Commit final, se necessário**

`docs(arquitetura): registrar organizacao modular do frontend`

## Fora deste plano

- Implementar backend/PostgreSQL.
- Unificar login MSAL/BFF.
- Alterar autorização e cadastro interno.
- Unificar aprovação diária e por apontamento.
- Corrigir cálculo dos relatórios.
- Alterar durabilidade do storage ou protocolo offline.
- Ativar TypeScript strict em massa.
- Adicionar lazy loading, biblioteca de estado ou aliases de import.
- Criar módulos vazios ou catálogo oficial de projetos.

Esses itens permanecem no roadmap da auditoria e devem ter especificações próprias depois que a estrutura mecânica estiver estável.
