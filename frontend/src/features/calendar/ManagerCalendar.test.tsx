// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ManagerCalendar } from './ManagerCalendar'

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const optionsOf = (select: HTMLSelectElement) => Array.from(select.options).map((option) => option.textContent)

describe('ManagerCalendar (diretoria)', () => {
  it('lista os colaboradores da equipe escolhida mesmo sem apontamentos', async () => {
    await act(async () => {
      root.render(<ManagerCalendar
        role="DIRECTOR_ADMIN"
        entries={[]}
        squads={[{ id: 't1', name: 'Automação' }, { id: 't2', name: 'Elétrica' }]}
        collaborators={[
          { id: 'hugo', name: 'Hugo Barbosa', squadId: 't1' },
          { id: 'hamilton', name: 'Hamilton Junior', squadId: 't1' },
          { id: 'eva', name: 'Eva Lima', squadId: 't2' },
        ]}
      />)
    })
    const [squadSelect, collaboratorSelect] = Array.from(container.querySelectorAll('select'))
    expect(optionsOf(collaboratorSelect)).toEqual(expect.arrayContaining(['Eva Lima', 'Hamilton Junior', 'Hugo Barbosa']))

    const automacao = Array.from(squadSelect.options).find((option) => option.textContent === 'Automação')!
    await act(async () => {
      squadSelect.value = automacao.value
      squadSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const names = optionsOf(container.querySelectorAll('select')[1] as HTMLSelectElement)
    expect(names).toContain('Hamilton Junior')
    expect(names).toContain('Hugo Barbosa')
    expect(names).not.toContain('Eva Lima')
  })
})
