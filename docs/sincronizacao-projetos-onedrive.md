# Sincronização dos projetos com o ESTUDOS.sqlite (OneDrive do Paulo)

O Banco 1 lê o `ESTUDOS.sqlite` do OneDrive do Paulo Porto 2 vezes por dia (7h e 13h)
e atualiza a tela **Projetos** da diretoria. A diretoria também pode clicar em **Sincronizar agora**.

## Como funciona (sem a TI)

1. Uma vez só, o **Paulo** entra em Projetos e clica em **Conectar OneDrive**.
   - Ele entra com a conta Microsoft dele e autoriza o app de login da SM&A a **ler os arquivos dele** (permissão `Files.Read`).
2. O servidor (Vercel) guarda a autorização **criptografada** no Supabase.
   - Ninguém vê essa autorização, nem a diretoria.
3. Às 7h e às 13h, o Supabase (pg_cron) chama `POST /api/projects-sync`. A Vercel então:
   - baixa o arquivo;
   - lê o SQLite;
   - espelha os dados na tabela de projetos:
     - projetos "Concluído", "Paralisado" ou que saíram do arquivo ficam inativos;
     - atividades que saíram do arquivo somem da lista de apontamento.
4. Se o arquivo não mudou, o servidor só registra "sem mudanças".

**Cuidados**

- A conexão é do Paulo.
  - Se ele trocar a senha, sair da empresa ou remover o acesso do app, a tela avisa "expirou". Aí ele clica em **Conectar OneDrive** de novo.
  - O código só abre o arquivo configurado. Mesmo assim, a permissão concedida pelo Paulo vale para os arquivos dele.
- Se a Microsoft mostrar **"Precisa de aprovação do administrador"**, a SM&A bloqueia esse tipo de autorização. Nesse caso, é preciso a TI (ver o fim deste guia).

---

## Parte 1 — App de login no Azure (quem cuida do app do login Microsoft)

O app é o mesmo cujo **Client ID** está em Supabase → Authentication → Providers → **Azure**.

1. Em https://portal.azure.com, vá em **Microsoft Entra ID → Registros de aplicativo** e abra esse app.
2. **Autenticação → Web → Adicionar URI**:
   `https://sma-apontamento-horas-murex.vercel.app/api/projects-sync`
   (use o endereço real do site, se for outro). Salve.
3. **Permissões de API → Adicionar uma permissão → Microsoft Graph → Permissões delegadas**. Marque:
   - `Files.Read`;
   - `offline_access`;
   - `User.Read`, que normalmente já está lá.

   Não é preciso clicar em "Conceder consentimento do administrador".
4. **Certificados e segredos → Novo segredo do cliente**, com validade de 24 meses.
   - Copie o **Valor** na hora.
   - O segredo antigo, que o Supabase usa no login, continua funcionando.
5. Em **Visão geral**, anote o **ID do aplicativo (cliente)** e o **ID do diretório (locatário)**.

Se você não conseguir editar esse app (não é proprietário dele), quem cuida do app ou a TI precisa fazer os passos 2 a 4.

## Parte 2 — Vercel (Settings → Environment Variables → Production)

| Variável | Valor |
|---|---|
| `PROJECTS_SYNC_CLIENT_ID` | ID do aplicativo (cliente) |
| `PROJECTS_SYNC_CLIENT_SECRET` | Valor do segredo (Parte 1, passo 4) |
| `PROJECTS_SYNC_TENANT_ID` | ID do diretório (locatário) |
| `PROJECTS_SYNC_FILE_PATH` | Caminho do arquivo em "Meus arquivos" do Paulo (ex.: `Controle/ESTUDOS.sqlite`) |
| `PROJECTS_SYNC_TOKEN` | Valor mostrado no fim do `11_RODAR_agendar_sincronizacao_projetos.sql` |
| `PROJECTS_SYNC_APP_URL` | (opcional) `https://sma-apontamento-horas-murex.vercel.app` |

Sobre o caminho do arquivo:

- Se no OneDrive web o arquivo aparece em **Meus arquivos › Controle › ESTUDOS.sqlite**, o caminho é `Controle/ESTUDOS.sqlite`.
- "Meus arquivos" não entra no caminho.

Sobre o `PROJECTS_SYNC_TOKEN`:

- Ele também protege a conexão do Paulo.
- Se for trocado, o Paulo precisa conectar de novo.

Depois de salvar as variáveis, faça um **Redeploy**.

## Parte 3 — Supabase (SQL Editor)

1. Rode o `10_RODAR_banco1_sincronizacao_projetos.sql`, que cria as tabelas e funções.
2. Rode o `11_RODAR_agendar_sincronizacao_projetos.sql`, que faz o agendamento. Antes, confira o endereço do site no arquivo.
3. Copie o código mostrado no final para `PROJECTS_SYNC_TOKEN` na Vercel e faça o Redeploy.

## Parte 4 — Paulo conecta o OneDrive

1. O Paulo entra no Apontamento 1 (ele é diretoria) e vai em **Projetos**.
2. Ele clica em **Conectar OneDrive**, entra com a conta **dele** e clica em **Aceitar**.
3. A tela volta com uma destas mensagens:
   - "OneDrive conectado com paulo.porto@…": está pronto. Clique em **Sincronizar agora**.
   - "não encontrei o ESTUDOS.sqlite no caminho configurado": confira `PROJECTS_SYNC_FILE_PATH`.
   - "aprovação de um administrador": a empresa bloqueia. Veja abaixo.

## Se a empresa bloquear (precisa da TI)

O caminho mais seguro com a TI é um app próprio, com `Sites.Selected`, que lê **só** o OneDrive do Paulo, sem depender da conta dele.
A TI também pode apenas aprovar o `Files.Read` do app de login: em Entra ID → Aplicativos empresariais → (app) → Permissões → **Conceder consentimento do administrador**.
Depois disso, o Paulo conecta normalmente.

## Conferir

- Na tela Projetos aparecem a conta conectada e a última sincronização.
- Execuções agendadas no Supabase:
  `select * from cron.job_run_details order by start_time desc limit 5;`
