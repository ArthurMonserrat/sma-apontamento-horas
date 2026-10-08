# SM&A — Frontend

Frontend corporativo da SM&A com perfis de Colaborador, Supervisor e Diretor/Administração, construído com React, TypeScript, Vite, Tailwind CSS e React Router.

## Escopo disponível

- seleção de perfil corporativo entre três perfis;
- dashboard com saldos reais consolidados por dia, mês, intervalo e total, sempre limitados ao dia atual;
- calendário mensal com feriados e eventos corporativos;
- criação, edição, duplicação e cancelamento lógico de apontamentos;
- importação opcional de Lista de Documentos em `.xlsx`/`.xlsm`, com busca e autopreenchimento de metadados, incluindo cliente VALE no formato atualmente homologado;
- geração opcional de RDO em PDF A4 paisagem sem salvar o formulário;
- histórico individual paginado, filtros e eventos do período;
- solicitações de folga e de alteração de carga horária;
- áreas funcionais para Colaborador, Supervisor e Diretoria/Administração;
- tema claro/escuro e layout responsivo.

## Perfis e rotas

| Perfil | Rota inicial | Conteúdo |
|---|---|---|
| Sem sessão | `/` | landing do Ecossistema SM&A com seleção dos bancos |
| Colaborador | `/colaborador` | apontamentos, saldos, histórico, folgas e perfil |
| Supervisor | `/supervisor` | gestão da equipe, solicitações, histórico e perfil |
| Diretor/Administração | `/administracao` | painel macro e gerenciamento de equipes |

O fluxo de entrada não usa senha. Não há backend, banco de dados ou autenticação real nesta fase.

## Execução local

```bash
npm ci
npm run dev
```

O Vite exibirá no terminal o endereço local da aplicação.

## Persistência local

Para executar o teste opt-in contra a LD real sem copiar o anexo para o repositório, defina `SMA_LD_REFERENCE` com o caminho externo do arquivo antes de `npm test`. Os demais testes usam apenas dados sintéticos.

Os repositórios locais escondem o acesso ao `localStorage`, de modo que possam ser substituídos por uma API. A sessão atual usa `sma:demo-session:v2`. Na primeira execução sem uma sessão `v2` válida, a sessão legada `v1` é invalidada de forma idempotente e a aplicação volta à landing `/`; essa migração não apaga apontamentos, perfil, folgas, cargas, aprovações ou tema.

Apontamentos usam `sma:time-entries:v4`; na primeira leitura necessária, a aplicação migra de forma encadeada `v1 → v2 → v3 → v4`, grava, relê e valida cada etapa e preserva `v1`/`v2`/`v3` como backups. A etapa `v3 → v4` substitui o antigo `clientId` por `clientName`, converte os IDs demonstrativos conhecidos e preserva IDs desconhecidos como texto. Depois de validar `v4`, consultas normais não combinam versões. Perfil, cargas, folgas, aprovações, notificações e auditoria usam chaves versionadas próprias.

O formulário não usa mais catálogo de clientes. Sem LD, o nome é digitado manualmente; ao selecionar um documento da LD no formato VALE, o campo recebe `VALE` e fica somente leitura enquanto o vínculo estiver ativo. A planilha real não possui uma célula textual “Cliente”: essa identificação é uma regra temporária e explícita de compatibilidade baseada no cabeçalho `Nº VALE`, coerente com a marca presente no arquivo. Formatos futuros sem identificação reconhecida não devem receber nomes inventados.

Feriados e eventos profissionais vêm de fontes locais determinísticas. Eles não representam uma fonte oficial completa. A interface do Colaborador não apresenta projeção futura; datas futuras não geram déficit no saldo real.

## Validação

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

O build é gerado em `dist/`, que permanece ignorado pelo Git. `node_modules/` também não é versionado.

`read-excel-file` é usado para interpretar o OOXML da LD no navegador. `jspdf` gera e baixa o RDO sem depender de backend; ambos são carregados somente quando o fluxo correspondente é acionado.
