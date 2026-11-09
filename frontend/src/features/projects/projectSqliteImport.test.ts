import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SQLITE_STATUSES, projectsFromDatabase, readProjectSqlite, sqlitePreview } from './projectSqliteImport'

async function buildDatabase(withActivities = true) {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(`
    create table projeto (codigo text primary key, supervisao text, cliente text, cliente_final text, local text, seg_mercado text, descricao text, status text);
    create table pessoa (id text primary key, nome text, ativo integer);
    create table programacao (pessoa_id text, data text, codigo text, atividade_id text);
  `)
  if (withActivities) db.run('create table atividade (id text primary key, projeto text, ordem real, atividade text, complemento text, executor_manual text)')
  db.run(`insert into projeto values
    ('25A163E', 'S2-BAA', 'APPIAN CAPITAL', 'APPIAN CAPITAL', 'Itagibá/BA', 'Mineração', 'Estudos ONS - Proj. Santa Rita', 'Em andamento'),
    ('24A001E', 'S1-HTC', 'VALE', null, null, null, 'Antigo', 'Concluído'),
    ('26A099E', 'S1-HTC', '  ', null, null, null, 'Sem cliente', 'Em abertura'),
    ('26a100e', null, 'CSN', null, null, null, null, 'Paralisado')`)
  db.run(`insert into pessoa values ('p1', 'Sabrina Drumond', 1), ('p2', 'Alan Franklin', 1), ('p3', 'Saiu Da Empresa', 0)`)
  if (withActivities) {
    db.run(`insert into atividade values
      ('a1', '25A163E', 1, 'Curto-circuito', null, 'Bruna Alvarenga'),
      ('a2', '25A163E', 2, 'Fluxo de Potência', null, null),
      ('a3', '25A163E', 3, 'Reuniões', '', 'Diversos'),
      ('a4', '24A001E', 1, 'Fluxo', null, null),
      ('a5', '25A163E', 4, '', null, null)`)
    db.run(`insert into programacao values
      ('p1', '2026-10-19', '25A163E', 'a2'), ('p1', '2026-10-20', '25A163E', 'a2'), ('p2', '2026-10-21', '25A163E', 'a2'),
      ('p3', '2026-10-22', '25A163E', 'a2'), ('p2', '2026-10-13', '25A163E', 'a1')`)
  }
  return { SQL, db }
}

describe('importação de projetos do banco SQLite', () => {
  it('lê projetos, atividades e executores (campo executor + programação)', async () => {
    const { db } = await buildDatabase()
    const data = projectsFromDatabase(db)
    expect(data.statuses).toEqual([
      { status: 'Concluído', count: 1 }, { status: 'Em andamento', count: 1 }, { status: 'Paralisado', count: 1 },
    ])
    const santaRita = data.projects.find((project) => project.code === '25A163E')!
    expect(santaRita).toMatchObject({ supervisionCode: 'S2-BAA', client: 'APPIAN CAPITAL', location: 'Itagibá/BA', marketSegment: 'Mineração', active: true })
    expect(santaRita.activities).toEqual([
      { name: 'Curto-circuito', complement: null, executorName: 'Bruna Alvarenga' },
      { name: 'Curto-circuito', complement: null, executorName: 'Alan Franklin' },
      { name: 'Fluxo de Potência', complement: null, executorName: 'Alan Franklin' },
      { name: 'Fluxo de Potência', complement: null, executorName: 'Sabrina Drumond' },
      { name: 'Reuniões', complement: null, executorName: null },
    ])
    expect(data.projects.find((project) => project.code === '26A100E')).toMatchObject({ active: false, status: 'Paralisado' })
  })

  it('a prévia traz só as situações escolhidas, sem a coluna de situação', async () => {
    const { db } = await buildDatabase()
    const data = projectsFromDatabase(db)
    const preview = sqlitePreview(data, DEFAULT_SQLITE_STATUSES)
    expect(preview.projects.map((project) => project.code)).toEqual(['25A163E'])
    expect(preview.projects[0]).not.toHaveProperty('status')
    expect(preview.executors).toEqual(['Alan Franklin', 'Bruna Alvarenga', 'Sabrina Drumond'])
    expect(sqlitePreview(data, ['Concluído', 'Paralisado']).projects.map((project) => [project.code, project.active])).toEqual([['24A001E', false], ['26A100E', false]])
  })

  it('lê o arquivo e recusa o que não é o banco de projetos', async () => {
    const { SQL, db } = await buildDatabase()
    const file = new Blob([new Uint8Array(db.export())])
    const data = await readProjectSqlite(file, async () => SQL)
    expect(data.projects).toHaveLength(3)
    await expect(readProjectSqlite(new Blob(['não é sqlite']), async () => SQL)).rejects.toThrow('banco de projetos (.sqlite)')
    const { db: incomplete } = await buildDatabase(false)
    await expect(readProjectSqlite(new Blob([new Uint8Array(incomplete.export())]), async () => SQL)).rejects.toThrow('tabelas de projetos')
  })
})
