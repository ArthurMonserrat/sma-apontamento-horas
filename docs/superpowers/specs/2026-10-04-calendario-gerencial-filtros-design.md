# Calendário gerencial com filtros — especificação

## Objetivo

Adicionar ao `sma-apontamento-horas` um calendário gerencial com filtros por colaborador para supervisão e por equipe e colaborador para diretoria, seguindo a interação de calendário existente no `banco-de-horas-2` e usando os dados e a identidade visual próprios do Banco 1.

## Experiência por perfil

### Supervisão

- Exibir o calendário na área principal de Gestão da Equipe.
- Permitir selecionar “Todos da equipe” ou um colaborador; não exibir filtro de equipe.
- Atualizar os totais e estados diários conforme os apontamentos visíveis.

### Diretoria

- Exibir o calendário no painel da diretoria.
- Oferecer filtro por equipe, inicialmente “Todas as equipes”, e por colaborador, inicialmente “Todos da equipe”.
- Ao trocar a equipe, redefinir o colaborador e limitar as opções à equipe selecionada.
- Usar a equipe histórica do `assignmentSnapshot` de cada registro. Incluir “Sem equipe” para registros sem snapshot válido.
- Listar equipes ativas de `squadService` e equipes antigas ainda presentes nos snapshots.

## Interações e apresentação

- Reutilizar `MonthlyCalendar`, estados visuais e tokens de calendário do Banco 1.
- Manter navegação entre meses e totais diários. Clicar em dia com registros visíveis seleciona a data e abre uma prévia somente de leitura; dia vazio apenas é selecionado.
- A prévia mostra todos os registros visíveis daquele dia, incluindo colaborador, projeto/atividade, duração, status e detalhamento disponível.
- Trocar qualquer filtro fecha a prévia aberta; trocar equipe também limpa o colaborador selecionado.
- Exibir dias sem apontamento. A expectativa segue a referência: 480 minutos em dias úteis, zero em fins de semana e horas trabalhadas zeradas em datas futuras.
- Campos ausentes em registros legados não causam erro e recebem apresentação vazia apropriada.

## Dados e limites

- Supervisão usa `dashboard.entries` e `dashboard.collaborators` já carregados.
- Diretoria usa registros do `supervisorService`, preservando `assignmentSnapshot` e detalhamento existentes, mais as equipes de `squadService`.
- As opções de colaborador da diretoria derivam dos registros carregados e são limitadas pela equipe histórica selecionada.
- Ordenar equipes e colaboradores alfabeticamente.
- Não alterar persistência, permissões, importação/exportação, cálculo de saldos, aprovação ou fluxos dos colaboradores.
- Não portar código, dados, serviços ou estilos do Banco 2.

## Arquitetura e aceite

- Criar um componente compartilhado `ManagerCalendar` em `features/calendar` e um adaptador que exponha os metadados gerenciais já gravados, sem duplicar leitura do armazenamento na apresentação.
- Integrar o componente à tela principal da supervisão e ao painel da diretoria.
- O filtro por colaborador da supervisão, os filtros em cascata da diretoria, “Sem equipe”, a prévia diária e a navegação mensal devem funcionar usando os registros do Banco 1.

## Fora de escopo

- Portar o calendário para a área do colaborador.
- Adicionar filtros por período, status, gerente, projeto ou supervisor.
- Alterar cadastro de equipes/colaboradores, APIs de produção ou os fluxos existentes de aprovação/reprovação.
