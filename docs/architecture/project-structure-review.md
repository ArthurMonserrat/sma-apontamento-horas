# Auditoria arquitetural — SM&A / Banco 1

Data: 10/10/2026. Repositório: `ArthurMonserrat/sma-apontamento-horas`. Branch examinada: `main`. Revisão: `f815522`.

## 1. Parecer executivo e escopo

A aplicação tem uma **base profissional parcial**, particularmente no domínio do Colaborador: funções de cálculo independentes de React, interfaces de serviço, versões de registros, migrações e testes. Entretanto, o conjunto ainda é uma aplicação demonstrativa em transição, **não uma solução pronta para operação corporativa com 1.000 usuários**. Autorização, consistência entre módulos e persistência confiável são os principais bloqueios; trocar nomes de pastas não os resolve.

Recomendo um **monólito modular organizado por capacidades de negócio**, preservando `frontend/` e `api/`, com separação leve entre domínio, casos de uso, adaptadores e UI dentro de cada módulo. Não recomendo reescrever a aplicação, implantar microserviços ou aplicar todas as camadas de Clean Architecture/FSD indistintamente.

A auditoria examinou roteamento, sessão, API Microsoft, serviços, persistência/migrações, aprovações, jornadas, calendário, relatórios, equipes, LD, RDO, testes, manifests, CI e documentação. A análise está limitada ao Banco 1 neste checkout; o Banco 2 não foi auditado. Não houve avaliação de carga, pentest, autenticação real no tenant, revisão visual nesta execução ou consulta à configuração privada de produção. Achados de código são distintos de falhas reproduzidas em execução.

Somente este relatório é produzido. Nenhuma recomendação foi implementada.

## 2. Estado atual

### Stack e organização observada

- React 19, TypeScript, Vite 8, Tailwind 4 e React Router 7 no frontend.
- MSAL Browser/React no frontend e MSAL Node em funções `api/` na raiz.
- Vitest em duas instalações independentes; Oxlint no frontend.
- localStorage para entidades e localforage/IndexedDB para fila offline.
- `read-excel-file` para LD, jsPDF para RDO, ExcelJS/file-saver para exportações, Recharts para gráficos, PWA via Workbox.
- Dois manifests e lockfiles, sem workspace npm declarado. Isso é viável nesta escala, mas exige comandos e fronteiras explícitos.
- Não foi encontrado schema de banco ou API de domínio de apontamentos neste repositório. Já existe backend de autenticação; portanto, a afirmação geral de que não existe backend está desatualizada.

```text
/
├── api/                         # login, callback, me, logout, MSAL, testes
├── docs/
│   ├── colaborador-*.md
│   └── superpowers/{plans,specs}/
├── frontend/
│   ├── docs/superpowers/        # segunda localização de documentação
│   ├── public/
│   ├── src/
│   │   ├── app/                 # rotas, providers, tema
│   │   ├── pages/               # páginas pequenas e páginas monolíticas
│   │   ├── components/          # UI genérica e componentes ligados à sessão
│   │   ├── features/
│   │   │   ├── announcements/ approvals/ audit/ calendar/
│   │   │   ├── collaborator/ document-list/ history/ offline/
│   │   │   ├── profile/ rdo/ reports/ session/ squads/
│   │   │   └── status/ supervisor/ time-entries/ time-off/ workloads/
│   │   ├── services/            # interfaces, adaptadores, regras, seeds e parsing
│   │   ├── shared/{types,utils}/
│   │   ├── mocks/ data/         # duas fontes demonstrativas
│   │   ├── config/ hooks/ types/ styles/ assets/
│   │   └── main.tsx
│   └── package.json
├── .github/workflows/deploy-pages.yml
├── package.json
└── vercel.json
```

### Aspectos positivos a preservar

1. **Domínio testável:** `features/calendar/domain.ts:56–116` calcula jornada e saldo em minutos; `features/workloads/domain.ts:4–12` resolve carga por vigência. Não é necessário transformar essas funções em classes.
2. **Contratos e injeção:** `services/timeEntryService.ts:70–92` declara operações, relógio, IDs, políticas e storage substituíveis. É uma boa base para adaptadores HTTP e testes determinísticos.
3. **Histórico e cancelamento:** o serviço preserva ID, criação, motivo e versão na edição (`timeEntryService.ts:338–361`), além de cancelamento lógico e rastreio de duplicação. Preservar os dados existentes durante qualquer evolução.
4. **Migrações defensivas:** `timeEntryService.ts:168–216` relê a gravação e impede novas escritas quando a leitura falha. O benefício existe, mas a garantia de durabilidade é enfraquecida pelo fallback descrito em R05.
5. **LD/RDO isolados:** `features/document-list/ldImport.ts:22–83` valida arquivo, localiza cabeçalhos e relata problemas por linha. `features/rdo/rdo.ts` separa dados e PDF; `CreateRdoButton.tsx:16–25` carrega o gerador sob demanda e não salva apontamento.
6. **Retenção mínima dos anexos:** o fluxo examinado persiste snapshot textual da LD, não a planilha; o RDO é gerado e baixado. Não recomendo adicionar armazenamento dos arquivos originais. A assinatura salva no perfil é uma decisão de retenção distinta e precisa de política própria.
7. **UI reutilizável:** tokens, badges, ícones, drawer e layouts já existem. Consolidar o que está duplicado em vez de substituir a identidade visual.
8. **Testes próximos do código:** facilita localizar regra e teste juntos. A suíte contém casos reais de negócio, não apenas snapshots.

## 3. Riscos e evidências

Referências `frontend/src/...` abaixo usam caminhos relativos ao repositório e linhas da revisão auditada. Gravidade considera o uso corporativo pretendido, não uma demonstração isolada.

### R01 — Crítico para produção: identidade e autorização misturadas ao modo demonstrativo

**Evidências:** `pages/ProfileSelectionPage.tsx:16–32` permite escolher qualquer um dos três papéis. `features/session/DemoSessionProvider.tsx:77–83` aplica o papel selecionado inclusive a uma identidade Microsoft. `services/demoSessionService.ts:46–81` restaura JSON local; `features/session/authGuard.ts:5–6` aceita `authProvider === 'microsoft'`. `DemoSessionProvider.tsx:18–24` prioriza a sessão local, antes de `/api/me`.

**Consequência:** autenticar na Microsoft não determina autorização empresarial. O papel é manipulável no cliente e a validade da sessão local não comprova uma sessão corporativa vigente. As telas gerenciais não constituem uma barreira de segurança. Isso não comprova acesso indevido a um banco central, que ainda não existe.

**Recomendação:** separar `AuthenticatedIdentity`, `ProfessionalProfile` e `AccessPolicy`; o servidor deve resolver cadastro ativo, papéis, vínculos de equipe e permissões. A escolha visual de perfil só pode selecionar entre papéis já autorizados. Ambiente demo deve ter adaptação explícita. Em `DemoSessionProvider.tsx:60–61`, não usar `demoCollaborator` como fallback para uma identidade corporativa sem cadastro: apresentar acesso ainda não provisionado.

### R02 — Alto: dois fluxos Microsoft sem contrato único

**Evidências:** `main.tsx:3–27` instala MSAL Browser; `EcosystemLogin.tsx:25–36` chama `loginPopup`; `api/login.ts:8–16` e `api/redirect.ts:22–43` implementam outro fluxo, confidencial. `DemoSessionProvider.tsx:28–40` tenta restaurar o cookie via API; o logout em `85–89` limpa cookie/local, mas não encerra explicitamente a conta MSAL Browser. O callback BFF não demonstra correlação `state` com a requisição iniciadora; armazena o access token do Graph diretamente no cookie e não há sessão própria revogável no servidor.

**Consequência:** login, expiração, troca de conta e logout podem divergir. A documentação BFF recomenda remover MSAL client-side, mas o código atual usa ambos. A chamada manual de `handleRedirectPromise` em `main.tsx:13` também deve ser revisada frente à inicialização administrada pelo provider; não foi reproduzida falha específica dessa inicialização nesta auditoria.

**Recomendação:** ADR escolhendo uma estratégia. Para este portal corporativo com APIs próprias, prefiro BFF de mesma origem, sessão opaca em cookie seguro e token no servidor. SPA com MSAL/PKCE e API validando tokens também é válida; escolher conforme hospedagem e integração. Não manter os dois como autoridades simultâneas. Validar correlação OAuth, expiração, logout e CSRF em operações mutáveis. Um access token destinado ao Graph não deve ser tratado como autorização da API SM&A.

### R03 — Crítico para confiabilidade: duas autoridades de aprovação

**Evidências:** `services/dayApprovalService.ts:17–18,91–110,149–160` controla aprovação por dia, competência, versão e supervisor responsável. `services/supervisorService.ts:16,281–309,360–381` mantém outro armazenamento por ID de apontamento e atualiza `TimeEntry.status` diretamente, sem atualizar a aprovação diária nem incrementar `TimeEntry.version`. `timeEntryService.ts:338–353` consulta a política diária e só rejeita explicitamente o status `CANCELLED` nesse trecho.

**Consequência:** uma aprovação gerencial pode não bloquear edição pelo contrato diário; uma edição pode preservar um status gerencial desatualizado. As duas visões não têm garantia única de consistência. Listagem e aprovação de apontamentos em `SupervisorService` não exigem escopo de equipe como parte do contrato, ao contrário do controle mais rigoroso presente no serviço diário.

**Recomendação:** primeiro definir com produto a unidade canônica de aprovação (o projeto já possui a regra diária); criar teste integrado criar → aprovar → tentar editar → solicitar correção. Unificar transições em um caso de uso e uma política de autorização. Não remover estados nem alterar regras apenas por preferência arquitetural.

### R04 — Alto: banco de horas calculado de forma incompatível nos relatórios

**Evidências:** `pages/RelatoriosPage.tsx:39–42` calcula jornada como dias úteis × 480 minutos. O domínio do Colaborador usa cargas versionadas, feriados e afastamentos (`features/calendar/domain.ts:56–91`, `features/workloads/domain.ts:4–12`). O parser em `RelatoriosPage.tsx:20–34` procura extras/noturnas persistidos que não fazem parte de `TimeEntry`, usando zero quando ausentes.

**Consequência:** colaborador de 4h/6h, feriado ou afastamento pode produzir saldo diferente conforme a tela; zero pode significar dado ausente, e não ausência de horas extras. Isso é mais grave que duplicação visual.

**Recomendação:** um modelo de consulta de saldos com semântica compartilhada. Relatórios devem receber valores calculados pelo domínio/servidor, com distinção entre zero e indisponível. Horas noturnas exigem dados e regra próprios; não derivá-las de uma duração sem horários.

### R05 — Alto: sucesso de gravação não significa durabilidade

**Evidências:** `services/storage.ts:51–61` grava primeiro em memória e captura falha no storage persistente; `getItem:37–48` devolve esse fallback. `timeEntryService.ts:206–216` relê por essa mesma abstração, podendo confirmar apenas a cópia em memória. Os testes em `storage.test.ts` tratam essa recuperação como comportamento esperado.

**Consequência:** usuário pode receber confirmação, fechar/recarregar e perder a gravação que existia só em memória. Versão local também não dá compare-and-swap atômico entre abas; `timeEntryService.update` lê antes de aguardar políticas assíncronas. Trata-se de conclusão sobre a composição das abstrações, não de reprodução de perda de dados reais nesta auditoria.

**Recomendação:** separar disponibilidade de durabilidade: resultado de escrita explícito (`persisted`, `volatile`, erro), feedback ao usuário e retry. Em produção, transação e controle otimista devem ocorrer no servidor. Auditoria pós-gravação (`postCommit.ts`, `timeEntryService.ts:251–266`) é best-effort hoje; não é uma trilha corporativa inviolável.

### R06 — Alto: fila offline sem idempotência de ponta a ponta

**Evidências:** `features/offline/useOfflineSync.tsx:23–30` cria o registro e depois remove o item; o ID da fila não entra em `timeEntryService.create`, que gera novos IDs (`timeEntryService.ts:320–328`). `services/offlineQueueService.ts:24–29` lista todos os itens. O provider em `app/App.tsx:9` envolve também rotas públicas e não recebe a identidade ativa. `processingRef` coordena uma instância, não múltiplas abas.

**Consequência:** falha entre criação e remoção pode duplicar registros; itens de outra sessão no mesmo navegador podem ser processados. A sincronização atual conclui gravação local, não transmissão a servidor.

**Recomendação:** chave de operação idempotente, partição por identidade/ambiente, status recuperável, backoff e serialização por entidade. No backend futuro, a mesma chave deve deduplicar requisições; simplesmente remover o item antes de salvar perderia dados.

### R07 — Alto: acesso aos mesmos dados espalhado e normalizações duplicadas

**Evidências:** `pages/DiretoriaPage.tsx:46–90`, `pages/RelatoriosPage.tsx:20–34`, `services/excelExportService.ts:74–106` e `services/supervisorService.ts:158–200` leem e interpretam o mesmo armazenamento. `pages/EquipesPage.tsx:65–80` persiste organograma diretamente. `profileService.ts` trabalha com outra representação de perfil/squad.

**Consequência:** alterar storage/API exige tocar várias telas; leitores divergem quanto a formatos/status; exportação e dashboard podem enxergar dados diferentes. Transferência na tela de equipes não demonstra atualizar todas as fontes que resolvem atribuição. `EquipesPage.tsx:199` identifica colaborador pelo nome na remoção da equipe, frágil diante de homônimos e renomeações.

**Recomendação:** uma fronteira de leitura/escrita por entidade, IDs estáveis e adapters explícitos para formatos legados. Organograma, perfil e snapshots históricos precisam de responsabilidades distintas: mudar equipe atual não deve reescrever a equipe histórica de apontamentos.

### R08 — Alto na escala pretendida: paginação visual e consultas sem limites reais

**Evidências:** `timeEntryService.ts:147–165,269–296` desserializa a coleção, filtra, ordena e só depois aplica slice. `features/history/useTimeEntryHistory.ts:104–124` busca também todos os registros do período para resumo. `useCollaboratorDashboard.ts:67–86,152` recalcula desde a primeira carga e refaz a carga ao trocar o dia selecionado. `calendar/domain.ts:96–98` percorre datas e reaplica filtros/reduções às coleções.

**Consequência:** custo cresce com anos de histórico mesmo exibindo dez linhas. Envolver loops em `useMemo` não substitui paginação de dados nem agregação de período.

**Recomendação:** contratos de consulta com período, cursor estável, ordenação e filtros; resumo independente da lista; cache por chave e invalidação após mutações. No futuro, API aplica autorização, filtros e limites, e banco fornece índices. No demonstrativo, indexar por dia/colaborador e não recalcular todo o histórico ao selecionar uma célula.

### R09 — Importante: páginas e arquivos compartilhados concentram mudanças

**Evidências:** `SupervisorPage.tsx` possui 684 linhas, perfil local, sidebar, histórico, filtros e ações; `EquipesPage.tsx`, 436; `timeEntryService.ts`, 449; `supervisorService.ts`, 446; `styles/index.css`, 639. `RelatoriosPage.tsx` concentra bastante JSX em linhas muito longas: contagem de linhas isolada não mede complexidade. `AppRoutes.tsx:3–17` importa todas as páginas estaticamente.

**Consequência:** maior superfície de conflito entre programadores; mudanças de uma subárea exigem entender responsabilidades alheias. Dois layouts de sidebar e sidebars internas aumentam custo de correção consistente. Imports estáticos favorecem carregamento inicial amplo.

**Recomendação:** extrair uma tela/subfluxo por vez para sua feature; páginas compõem rotas e componentes. Shell em `app/layouts` recebe configuração de navegação; widgets de perfil não pertencem a `shared/ui`. Lazy loading por rota gerencial é uma melhoria de desempenho independente da refatoração de domínio.

### R10 — Importante: limites de módulos implícitos e tipos ambíguos

**Evidências:** `shared/types/domain.ts:1–18` importa/reexporta tipos de features, invertendo a ideia de shared como camada inferior. Também define `DailySummary`, enquanto `features/calendar/types.ts` possui outro resumo mais completo. Services importam implementações globais de outros services; `CreateRdoButton` depende do tipo interno do hook do formulário. `TimeEntry` contém `projectCode` obrigatório e `contractorNumber` opcional (`features/time-entries/types.ts:34–41`); `useTimeEntryForm.ts:163–164` preenche ambos a partir da contratada, com limites de 80 e 160 caracteres em validações diferentes.

**Consequência:** mudanças internas propagam para consumidores; o mesmo conceito tem duas representações. Não criar catálogo de projetos para encobrir essa compatibilidade: o produto atualmente usa número da contratada. Além disso, `profileService.ts:75–88` armazena um perfil único e compara seu ID, em vez de consultar uma coleção de cadastros: a interface `getById` parece mais geral do que o adaptador efetivamente é.

**Recomendação:** DTO do formulário/RDO independente do hook, contrato público por módulo e um nome canônico para a contratada após migração aprovada. Manter aliases legados apenas no adaptador de compatibilidade. O serviço de composição monta dependências em `app`, em vez de cada módulo escolher singletons globais.

**Ciclos:** inspeção estática via AST TypeScript em 140 arquivos de produção de `frontend/src` não encontrou ciclos em imports/reexports relativos resolvidos (`.ts`, `.tsx`, `index`). Incluiu imports de tipos; não cobriu imports dinâmicos, terceiros ou ligações de runtime. Portanto, há acoplamento, mas não há evidência para declarar dependência circular atual.

### R11 — Importante: validação automatizada e CI incompletos

**Evidências:** `frontend/tsconfig.app.json` não habilita `strict` e não estende configuração que o habilite; `tsconfig.json` da raiz habilita strict somente para `api`. O lint configura hooks, mas não fronteiras de módulos. `npm test` da raiz descobre testes do frontend com outro Vitest, causando erro de resolução de jsdom. `.github/workflows/deploy-pages.yml` instala e faz build, sem executar testes/lint. `package.json` da raiz usa `npm install --prefix frontend` no build, em vez de instalação travada por lockfile.

Testes de interface como `features/time-entries/interface.test.tsx` e `pages/ProfileSelectionPage.test.tsx` renderizam HTML estático; verificam estrutura, mas não provam navegação, clique, persistência após reload ou logout. Há testes DOM em outras partes, logo não se trata de ausência absoluta de testes de interface. Não foi encontrada configuração versionada de Playwright/Cypress.

**Recomendação:** scripts separados de API/frontend e pipeline de PR com testes, lint, typecheck e build; ativar strict gradualmente, sem espalhar `any`; acrescentar poucos testes de integração/E2E para invariantes reais. Não inferir proteção de branch ou status da CI privada, que não foram consultados.

### R12 — Importante: documentação e distribuição não descrevem uma realidade única

**Evidências:** `frontend/README.md:28` afirma ausência de backend/autenticação real, apesar de `api/` e MSAL. A linha 44 cita `sma:time-entries:v4`; o código usa `apontamentos_sma` (`timeEntryService.ts:31`). O documento funcional começa descrevendo criação `ACTIVE`, mas o serviço cria `PENDING` (`timeEntryService.ts:326`). A spec BFF de 14/09 pede remover Pages/MSAL SPA, enquanto o workflow Pages e os dois fluxos permanecem. Há documentação em `docs/` e `frontend/docs/`.

**Recomendação:** separar estado atual, histórico e proposta; criar ADRs curtos com decisão/data/status. Definir Vercel como runtime que suporta API ou manter Pages explicitamente como demo estática; Pages não executa `api/`. `main.tsx` registra service worker com atualização automática: a estratégia de atualização deve considerar formulários em andamento e compatibilidade de storage.

## 4. Arquitetura recomendada e alternativas

| Opção | Adequação ao SM&A | Decisão |
|---|---|---|
| Organização apenas por tipo (`components`, `services`, `hooks`) | Simples no início, dispersa o mesmo negócio e concentra arquivos compartilhados | Não expandir como padrão principal |
| Monólito modular por funcionalidade/domínio | Aproveita features existentes, facilita ownership e migração incremental | **Escolhida** |
| Clean Architecture completa | Protege domínio, mas interfaces/casos de uso para cada operação simples aumentam navegação e manutenção | Usar princípios de inversão e adapters só nos limites relevantes |
| DDD tático amplo | Útil para jornada, aprovação, competência e atribuição; excessivo em tema, ícones ou exportação simples | Usar linguagem ubíqua, invariantes e limites; não criar agregados artificiais |
| Feature-Sliced Design estrito | Regras explícitas de import e API pública são úteis, mas migrar tudo para camadas/sllices exige movimentação extensa | Aproveitar regras; não impor taxonomia completa agora |
| Microfrontends/microserviços | 1.000 usuários não implica necessidade de distribuição por equipe/deploy | Desnecessário no momento |

Regra de dependências proposta: páginas e composição → UI/casos de uso do módulo → domínio/contratos. Adaptadores implementam contratos e são conectados em `app/composition`; domínio não importa React, navegador ou clientes HTTP. `shared` não importa módulos. Comunicação entre módulos usa contratos públicos estreitos; orquestração transversal fica no caso de uso dono da operação.

Colaborador, Supervisor e Administração são **áreas de experiência**, não três implementações distintas de apontamentos, jornadas e aprovação. Compartilham os domínios, com permissões e consultas diferentes. A API futura é autoridade das invariantes; validação no frontend serve à experiência.

### Árvore-alvo completa em nível de módulos

Esta árvore é um mapa de destino, não uma ordem para criar diretórios vazios. Subpastas só entram quando houver arquivos para elas. `*.test.*` permanece próximo do código; `tests/e2e` guarda fluxos completos.

```text
/
├── api/                                 # handlers Vercel finos; manter URLs
│   ├── login.ts
│   ├── redirect.ts
│   ├── me.ts
│   └── logout.ts
├── server/                              # extrair ao evoluir o BFF/backend
│   ├── auth/{session,identity,authorization}/
│   ├── modules/
│   │   ├── workforce/                   # cadastro, equipes, vigências
│   │   ├── time-entries/
│   │   ├── approvals/
│   │   ├── time-off/
│   │   ├── time-balances/
│   │   └── reports/
│   └── infrastructure/{http,persistence,observability}/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   │   ├── routes/                  # rotas por área e guards
│   │   │   ├── providers/               # sessão, tema, sincronização
│   │   │   ├── layouts/                 # shell, header, sidebars/drawer
│   │   │   ├── composition/             # liga interfaces a adapters
│   │   │   └── config/                  # ambiente validado
│   │   ├── pages/
│   │   │   ├── access/
│   │   │   ├── collaborator/
│   │   │   ├── supervisor/
│   │   │   └── administration/
│   │   ├── features/
│   │   │   ├── auth/{model,application,infrastructure,ui}/
│   │   │   ├── workforce/{model,application,infrastructure,ui}/
│   │   │   ├── time-entries/
│   │   │   │   ├── domain/              # tipos, validação, transições
│   │   │   │   ├── application/         # comandos e portas
│   │   │   │   ├── infrastructure/      # local/http/migrações
│   │   │   │   ├── model/               # hooks e estado de formulário
│   │   │   │   ├── ui/                  # formulário, lista, detalhes
│   │   │   │   └── index.ts             # contrato público explícito
│   │   │   ├── approvals/{domain,application,infrastructure,ui}/
│   │   │   ├── workloads/{domain,application,infrastructure,ui}/
│   │   │   ├── time-off/{domain,application,infrastructure,ui}/
│   │   │   ├── time-balances/{domain,application,model,ui}/
│   │   │   ├── calendar/{model,ui}/     # visualização consome saldos/eventos
│   │   │   ├── calendar-events/{domain,application,infrastructure}/
│   │   │   ├── document-list/{model,parsers,ui}/
│   │   │   ├── rdo/{model,renderers,ui}/
│   │   │   ├── reports/{model,application,infrastructure,ui}/
│   │   │   ├── announcements/{model,application,infrastructure,ui}/
│   │   │   ├── audit/{model,application,infrastructure}/
│   │   │   ├── notifications/{model,application,infrastructure,ui}/
│   │   │   └── offline/{model,application,infrastructure,ui}/
│   │   ├── shared/
│   │   │   ├── ui/                     # botões, diálogo, campos sem negócio
│   │   │   ├── lib/{date,time}/
│   │   │   ├── infrastructure/{http,storage}/
│   │   │   ├── styles/                 # tokens, base, utilities
│   │   │   └── assets/brand/
│   │   ├── demo/{fixtures,adapters}/
│   │   └── main.tsx
│   ├── tests/e2e/
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── architecture/{project-structure-review.md,decisions/}
│   ├── product/                         # regras atuais, por domínio
│   ├── operations/                      # executar, publicar, recuperar
│   └── archive/                         # planos históricos identificados
├── .github/workflows/                   # validação e deploy explícitos
├── package.json
└── vercel.json
```

`workforce` reúne cadastro profissional, equipes/squads e supervisores com IDs e vigências; não significa eliminar os componentes de perfil. `workloads` conserva regras próprias de carga. `projects` e `project-documents` só surgem quando houver catálogo oficial e requisitos aprovados; hoje número da contratada e snapshot LD não justificam um módulo CRUD fictício. `reports` contém projeções/exportadores, não novas regras de saldo. Pastas `server/modules` são evolução futura, não backend a implementar nesta tarefa.

### Movimentações justificadas, sem executá-las

| Origem | Destino lógico | Benefício |
|---|---|---|
| `services/timeEntryService.ts` | `features/time-entries/application` (contrato/casos de uso) e `infrastructure` (local) | Trocar persistência sem reescrever telas |
| `services/timeEntryMigration.ts` | `features/time-entries/infrastructure/migrations` | Isolar compatibilidade legada |
| `services/supervisorService.ts` | Casos de uso de `approvals`, consultas de `workforce`, fixtures em `demo` | Separar regra, autorização e dados demonstrativos |
| `pages/SupervisorPage.tsx` | Página de composição + componentes por subárea + shell em `app/layouts` | Reduzir conflitos de merge e testes gigantes |
| `pages/EquipesPage.tsx` | Página + casos de uso/UI de `workforce` | Remover persistência e identidade por nome da tela |
| `features/calendar/domain.ts` | Cálculo em `time-balances/domain`; grade/legenda em `calendar` | Domínio de horas não depende da apresentação do calendário |
| `services/excelExportService.ts` | `reports/infrastructure/exporters` | Exportador recebe DTO, sem ler storage por conta própria |
| `components/Sidebar.tsx`, `DirectorSidebar.tsx` e sidebar interna | `app/layouts` | Comportamento estrutural comum com menus por papel |
| `data/mockDEP.ts`, `mocks/demoData.ts` | `demo/fixtures` com contratos distintos explícitos | Impedir fallback demonstrativo em modo corporativo |
| `shared/types/domain.ts` | Tipos junto de seus donos; eliminar reexports redundantes progressivamente | Menos dependência indireta e ambiguidade |
| `frontend/docs/superpowers` | Índice/histórico em `docs` em etapa aprovada | Fonte documental encontrável e versionada |

Cada movimentação deve ser um commit mecânico separado de alteração de comportamento, com consumidores migrados e compatibilidade preservada. Evitar mover todos os arquivos numa única PR.

## 5. Evolução para operação corporativa

| Capacidade | Situação atual | Condição para amadurecer |
|---|---|---|
| Backend/banco | API de autenticação parcial, negócio no navegador | Contratos, banco com transações, migrations, backup/restauração e autorização |
| Microsoft Entra ID | Dois fluxos presentes e cadastro interno ausente | Uma autoridade de sessão; identidade vinculada a cadastro interno ativo |
| Permissões | Papel local e guard de UI; algumas políticas em services | Verificar usuário, operação e recurso/equipe no servidor em cada consulta/mutação |
| Equipes móveis | Snapshots úteis, mas organograma/perfis dispersos | Vínculos por IDs e vigências, histórico preservado, owner da gestão cadastral |
| Novos módulos | Features favorecem expansão | API pública por módulo, ownership e regras de import verificáveis |
| Trabalho paralelo | Hotspots em páginas/services centrais | Contratos acordados, PRs pequenas, responsáveis por módulo e testes de integração |
| CI/CD | Build Pages versionado e configuração Vercel | Pipeline confiável de PR, ambiente alvo claro, promoção/rollback e smoke tests |
| Longo prazo | Testes e migrações existentes | ADRs, semântica canônica, observabilidade e orçamento de desempenho |

**Escalabilidade organizacional:** módulos coesos reduzem dependências entre desenvolvedores e conflitos; nomes/pastas por si só não mudam tempo de resposta.

**Escalabilidade de infraestrutura:** 1.000 cadastrados não equivale a 1.000 simultâneos. Cenário ilustrativo, não medido: 1.000 pessoas × 4 apontamentos × 220 dias = 880.000 registros/ano. Não enviar essa coleção inteira ao navegador. Consultas individuais e gerenciais precisam de índices por usuário/equipe/período/status, paginação real, agregações e limites. O dimensionamento depende de picos de gravação, fechamento mensal, exportações e volume por LD, medidos por teste de carga.

Um backend modular com banco relacional pode atender esse cenário sem microserviços, sujeito a medição e configuração. Geração de exportações grandes poderá migrar para jobs; LD/RDO locais continuam adequados para arquivos moderados e respeitam a preferência de não armazenar o original. Web Worker para parsing é opcional após medir travamentos.

Operações de negócio e auditoria devem compartilhar transação ou mecanismo durável equivalente. Idempotência, controle de versão e recuperação de falhas importam mais que aumentar o número de servidores. Não prometer isolamento corporativo com localStorage, que pertence ao dispositivo/origem e pode ser alterado pelo próprio usuário.

## 6. Plano incremental

Esforços em dias úteis de engenharia, estimativas indicativas para um desenvolvedor familiarizado, incluindo testes/revisão, não compromissos de prazo. Integrações dependem de TI e decisões de produto.

### Críticas — antes de usar dados reais e permissões corporativas

| Prioridade / problema | Solução e arquivos afetados | Benefício / conclusão verificável | Esforço | Risco |
|---|---|---|---|---|
| P0 / R01–R02 | ADR de autenticação; depois sessão única em `api/*`, `main`, `session/*`, seleção de perfil | Expiração/logout coerentes; papéis do cadastro; testes negam autoelevação | Decisão 1–2 dias; implementação 5–10+ | Alto |
| P0 / R03 | Teste integrado e autoridade única em `supervisorService`, `dayApprovalService`, `timeEntryService` | Aprovação bloqueia edição em todas as visões; versão/auditoria coerentes | 3–6 dias | Alto, regra existente |
| P0 / R04 | Relatórios usam saldo canônico; `RelatoriosPage`, calendário/cargas/exportação | Mesma pessoa e período produzem mesmo saldo, inclusive 4h/6h e feriado | 2–4 dias | Médio |
| P0 / R05–R06 | Escrita durável explícita, fila idempotente e por sessão; storage/offline/entry | Quota/reload não perdem confirmação; retry não duplica | 3–6 dias | Alto, dados legados |

Essas prioridades não autorizam backend agora. O cadastro, escopo de equipe, política de sessão e semântica da aprovação precisam ser definidos antes da exposição corporativa.

### Importantes — alto impacto e migração controlada

| Prioridade / problema | Solução e arquivos afetados | Benefício / conclusão verificável | Esforço | Risco |
|---|---|---|---|---|
| P1 / R11 | Delimitar testes API/frontend e pipeline; manifests/configuração de teste/workflow | Um comando de validação reproduzível; PR bloqueada se verificações falharem | 0,5–1,5 dia | Baixo |
| P1 / R12 | Atualizar estado atual e ADRs; README/docs | Equipe deixa de implementar orientações contraditórias | 1–2 dias | Baixo |
| P1 / R07 | Extrair primeiro leitor de relatórios para porta de consulta; depois Diretoria/exportação | UI sem parsing de storage, teste de contrato único | 2–4 dias por fatia | Médio |
| P1 / R09 | Extrair histórico/perfil/avisos do Supervisor e shell comum, sem redesenho | Testes de navegação protegem seleção, scroll e layout | 2–4 dias | Médio |
| P1 / R10 | Canonizar número da contratada com migration compatível e limites únicos | Manual/LD/edit/duplicação/RDO preservam mesmo valor | 1–3 dias | Médio |
| P1 / R11 | Strict gradual por módulo, validação de DTOs na entrada | Erros de nulidade/formato detectados antes de renderizar | 2–5 dias | Médio |
| P1 / R08 | Definir portas de resumo/paginação; reduzir recomputação | Trocar dia não carrega histórico completo; testes de contrato com volume | 2–4 dias frontend; API separada | Médio |

### Opcionais — após invariantes e fronteiras

- Lazy loading das áreas gerenciais, medir bundle e navegação; `AppRoutes`/páginas. Impacto médio, 0,5–2 dias, risco baixo.
- Consolidar tokens/base/utilities em folhas distintas sem mudar cores; `styles/index.css`. Impacto baixo a médio, 1 dia, risco de regressão CSS.
- Workspace npm para comando único e dependências coerentes, se os dois pacotes continuarem sendo mantidos juntos. Impacto médio, 1–2 dias, risco médio de CI/deploy.
- Regras automáticas de dependência/import e ownership por módulo. Impacto médio, 1–2 dias, risco baixo; não exigir library nova se a ferramenta atual cobrir.
- Worker de LD e jobs de exportação apenas com medição de necessidade. Esforço variável; não fazer por antecipação.

### Desnecessárias neste momento

Microfrontends; microserviços por perfil; Kubernetes; event sourcing; CQRS com infraestrutura separada; Redux global obrigatório; repository genérico para toda entidade; abstração de um único componente sem reuso; criar catálogo de projetos fictício; mudar React/Vite de framework; converter todas as funções puras em classes; criar todas as pastas da árvore-alvo de uma vez.

### Sequência e proteções

1. **Primeira etapa:** estabelecer baseline confiável de validação e documento de decisões. Corrigir somente escopo dos testes/scripts/CI após aprovação; adicionar cenários de integração da aprovação e saldos sem alterar ainda sua regra.
2. Resolver sessão/permissões e contrato canônico de aprovação antes de uso produtivo. Se continuar demo, rotular e isolar esse modo explicitamente.
3. Extrair uma porta de consulta de relatórios e reutilizar cálculos de jornada. Validar resultados comparando o mesmo período no Colaborador e na Direção.
4. Resolver persistência/fila, preservando backups e migrações idempotentes; testar quota, reload e repetição.
5. Migrar módulos por fatias pequenas e só depois otimizar carregamento. Não misturar mudança de cálculo, rename de campo e movimentação de centenas de imports na mesma entrega.

Para cada fatia: testes de comportamento antes/depois, diff restrito, revisão por outro desenvolvedor, smoke test nas três áreas, verificação de migração, rollback por commit. Não apagar chaves antigas sem política e evidência de recuperação. Nenhum merge/rebase/movimento foi executado nesta auditoria.

## 7. Verificações e limites das evidências

- Frontend `npm test -- --reporter=dot`: **341 testes aprovados**, 1 ignorado; 50 arquivos aprovados, 1 ignorado. Teste ignorado é o opt-in da LD real, dependente de anexo externo.
- Raiz `npm test -- --reporter=dot`: **falhou**, exit 1, por worker de `PerfilPage.test.tsx` não resolver `jsdom` a partir do Vitest da raiz. Demais contagens não tornam essa execução aprovada.
- Isolamento `npm test -- api`: **6 testes aprovados em 2 arquivos**. Confirma o problema de descoberta/ambiente entre pacotes; não instalar jsdom na raiz como correção automática.
- Frontend lint e TypeScript: passaram; API `npm run typecheck`: passou. Typecheck sem strict não equivale a validação estrita.
- Build frontend: **aprovado**, incluindo postbuild e PWA; **1.157 módulos transformados**. Chunk principal de **2.247,24 kB** (gzip **652,55 kB**), aviso de chunks acima de 500 kB e aviso de tempo em plugins. São evidências para medir e dividir carregamento, não motivo para reescrita. Precache de 16 entradas, 3.078,92 KiB.
- Inspeção de ciclos: nenhum encontrado no escopo estático descrito em R10.
- Sem instalação/atualização de dependências. Os comandos usaram o `node_modules` disponível: Vite reportou 8.1.4, dentro da faixa declarada; não foi uma reinstalação limpa por lockfile, nem certificação de supply chain.
- Testes emitiram avisos de client ID MSAL ausente e falhas de storage simuladas. Não foi autenticada uma conta Microsoft real.
- Testes aprovados demonstram os cenários cobertos, não eliminam os achados de autorização, cruzamento entre services ou falha após gravação.
- `git diff --check`: aprovado. Estado final esperado: somente `docs/architecture/project-structure-review.md` novo; nenhum arquivo funcional modificado. Como o relatório é untracked, foi conferido também diretamente para espaços finais/conflitos, sem staging.

## 8. Respostas objetivas

**A estrutura é profissional?** Parcialmente. A área do Colaborador tem boa engenharia de domínio e testes; os módulos gerenciais, autenticação e persistência ainda têm padrões conflitantes. Não é correto classificá-la inteira como improvisada nem como pronta.

**Está preparada para empresa de grande porte?** Não para produção com responsabilidade por horas e permissões. É uma base evolutiva; precisa de autoridade no servidor, fonte de dados consistente, testes de integração e operação confiável.

**Maiores problemas:** papéis locais coexistindo com Microsoft; aprovações e saldos divergentes; múltiplos leitores/escritores de storage; persistência/fila sem garantia de durabilidade/idempotência; testes e documentação com fronteiras desatualizadas.

**O que permanece:** React/TypeScript/Vite, funções puras de jornada, features já coesas, minutos inteiros, vigência de carga, snapshots históricos, cancelamento/versão, validação da LD, geração local de RDO, testes próximos do domínio e tokens visuais.

**Arquitetura:** monólito modular orientado a capacidades com separação leve de domínio, aplicação, adapters e UI; backend futuro modular, não distribuído por perfil.

**Cinco melhorias mais importantes:** (1) uma sessão e autorização corporativa; (2) aprovação canônica; (3) cálculo de saldo único em todas as visões; (4) persistência/fila com garantias explícitas; (5) validação/CI confiável e fronteiras de acesso a dados testáveis.

**Primeira reorganização:** baseline de validação e uma pequena extração do acesso a dados dos relatórios, depois de caracterizar resultados. Não começar movendo a árvore inteira.

## Referências externas de apoio

As evidências dos problemas vêm do repositório. As referências abaixo apoiam somente os princípios usados nas recomendações:

- [Microsoft: Authorization Code Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow): correlação do fluxo e uso de PKCE conforme tipo de cliente; não confundir autenticação do provedor com autorização de negócio.
- [Feature-Sliced Design: visão geral](https://feature-sliced.design/docs/get-started/overview): limites de import e contratos públicos; usados seletivamente, sem exigir migração integral.
- [React: lazy](https://react.dev/reference/react/lazy): carregamento sob demanda de componentes; otimização distinta de modularização organizacional.
