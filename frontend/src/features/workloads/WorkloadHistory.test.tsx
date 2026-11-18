import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { demoWorkloadVersions } from '../../demo/fixtures/demoData'
import { WorkloadHistory } from './WorkloadHistory'

describe('histórico de cargas', () => {
  it('exibe somente as versões administrativas da carga', () => {
    const markup = renderToStaticMarkup(<WorkloadHistory versions={demoWorkloadVersions} />)

    expect(markup).toContain('Histórico de cargas')
    expect(markup).not.toContain('Solicitações')
    expect(markup).not.toContain('alteração de carga')
  })
})
