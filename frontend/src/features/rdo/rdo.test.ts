import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildRdoData, downloadRdo, generateRdo, rdoFileName } from './rdo'

const values = { entryDate: '2026-09-07', projectCode: 'Ab/001', clientName: 'Cliente de Teste', activityId: 'activity', disciplineCode: 'M', documentTypeCode: 'MD', contractorNumber: '  00-Ab/1  ', hours: '1', minutes: '30', details: '' }
const context = { name: 'Profissional de Teste', jobTitle: 'Engenheira', clientName: 'Cliente de Teste', activityName: 'Análise de documento' }
const logo = new Uint8Array(readFileSync(new URL('../../assets/brand/sma-logo.jpg', import.meta.url)))
const signatureBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyqiiiu880/9k='

describe('RDO independente da gravação', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  it('usa dados manuais e não inventa campos indisponíveis', () => {
    const data = buildRdoData(values, context)
    expect(data).toMatchObject({ contractor: 'SM&A Sistemas Elétricos e Automação', contractorNumber: '00-Ab/1', projectCode: 'Ab/001', duration: '01:30', details: '', professional: 'Profissional de Teste', category: 'Engenheira', discipline: 'Mecânica' })
    expect(data.object).toBe('')
    expect(data.valeNumber).toBe('')
    expect(data).not.toHaveProperty('startTime')
    expect(data).not.toHaveProperty('signature')
  })
  it('usa título e número do documento selecionado sem inferir projeto', () => {
    const data = buildRdoData({ ...values, ldDocument: { valeNumber: 'LD-002', title: 'Memória de cálculo', documentTypeCode: 'ZZ', disciplineName: 'GERAL', fileName: 'teste.xlsm' } }, context)
    expect(data.object).toBe('Memória de cálculo')
    expect(data.valeNumber).toBe('LD-002')
    expect(data.projectCode).toBe('Ab/001')
  })
  it('sanitiza o nome do download sem caracteres de caminho', () => {
    expect(rdoFileName(buildRdoData(values, context))).toBe('RDO_2026-09-07_Ab_001.pdf')
  })
  it('gera PDF A4 paisagem válido, com logo e estrutura tabular sem exigir LD ou detalhamento', () => {
    const pdf = generateRdo(buildRdoData(values, context), logo)
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(297, 0)
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(210, 0)
    const output = pdf.output()
    expect(output).toMatch(/^%PDF-/)
    expect(output).toContain('RIO DE OBRA')
    expect(output).toContain('DADOS DO APONTAMENTO')
    expect(output).toContain('ATIVIDADE REALIZADA')
    expect(output).not.toContain('/ contrato')
    expect(pdf.getNumberOfPages()).toBe(1)
    expect(output).toContain('/Subtype /Image')
  })
  it('preserva assinatura digital opcional e renderiza no PDF', () => {
    const data = buildRdoData(values, { ...context, assinaturaBase64: signatureBase64 })
    expect(data.assinaturaBase64).toBe(signatureBase64)
    const pdf = generateRdo(data, logo)
    expect(pdf.output()).toMatch(/^%PDF-/)
    expect(pdf.getNumberOfPages()).toBe(1)
  })
  it('quebra texto longo em páginas mantendo todas as palavras', () => {
    const pdf = generateRdo(buildRdoData({ ...values, details: 'Atividade de engenharia e automação. '.repeat(500) + 'ULTIMO_MARCADOR' }, context), logo)
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1)
    expect(pdf.output()).toContain('ULTIMO_MARCADOR')
  })
  it('rejeita data ou duração inválida de forma controlada', () => {
    expect(() => buildRdoData({ ...values, hours: '' , minutes: '' }, context)).toThrow(/duração/i)
    expect(() => buildRdoData({ ...values, entryDate: '' }, context)).toThrow(/data/i)
  })
  it('inicia o download e libera a URL temporária', () => {
    vi.useFakeTimers()
    const click = vi.fn()
    const remove = vi.fn()
    const appendChild = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:rdo')
    const revokeObjectURL = vi.fn()
    const link = { href: '', download: '', click, remove }
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { appendChild } })
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const pdf = generateRdo(buildRdoData(values, context), logo)

    downloadRdo(pdf, 'RDO_teste.pdf')

    expect(link).toMatchObject({ href: 'blob:rdo', download: 'RDO_teste.pdf' })
    expect(appendChild).toHaveBeenCalledWith(link)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rdo')
  })
})
