// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { useProfile } from '../features/collaborator/useProfile'
import { demoAssignmentSnapshot, demoCollaborator, demoSquads, demoWorkloadVersions } from '../mocks/demoData'
import { PerfilPage } from './PerfilPage'

const { useProfileMock } = vi.hoisted(() => ({ useProfileMock: vi.fn() }))
vi.mock('../features/collaborator/useProfile', () => ({ useProfile: useProfileMock }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../app/providers/tourContext', () => ({ useTour: () => ({ startTour: vi.fn() }) }))

const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
let container: HTMLDivElement
let root: Root
let state: ReturnType<typeof useProfile>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(), fillRect: vi.fn(), scale: vi.fn(), beginPath: vi.fn(),
    arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(),
    stroke: vi.fn(), setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  state = {
    data: {
      profile: { ...demoCollaborator, assinaturaBase64: signature },
      assignment: demoAssignmentSnapshot,
      squads: demoSquads,
      workloadVersions: demoWorkloadVersions,
      workloadRequests: [],
      currentWorkload: demoWorkloadVersions[0],
    },
    isLoading: false, isSaving: false, error: null,
    reload: vi.fn(), updateProfile: vi.fn(), updateSignature: vi.fn(),
    changeSquad: vi.fn(), createInitialWorkload: vi.fn(), requestWorkloadChange: vi.fn(),
  }
  useProfileMock.mockImplementation(() => state)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<PerfilPage />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function clickButton(label: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label)
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

function profileFields() {
  return [...container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[aria-labelledby="profile-edit-title"] input, [aria-labelledby="profile-edit-title"] select')]
}

describe('assinatura no perfil', () => {
  it('mantém a assinatura salva visível e permite desenhar outra sem etapas extras', () => {
    expect(container.querySelector('img[alt="Assinatura atual"]')?.getAttribute('src')).toBe(signature)
    expect(container.querySelector('canvas[aria-label="Área para desenhar a assinatura"]')).not.toBeNull()
    expect([...container.querySelectorAll('button')].map((button) => button.textContent)).toContain('Salvar Assinatura')
  })

  it('preserva os campos profissionais em edição quando o perfil recarrega após salvar a assinatura', async () => {
    await clickButton('Editar Perfil')
    const draft = ['Nome em edição', 'edicao@example.com', 'Cargo em edição', demoSquads.find((squad) => squad.id !== demoCollaborator.activeSquadId)!.id]
    act(() => {
      profileFields().forEach((field, index) => {
        const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, draft[index])
        field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
      })
    })
    expect(profileFields().map((field) => field.value)).toEqual(draft)

    act(() => {
      state = { ...state, data: { ...state.data!, profile: { ...state.data!.profile, assinaturaBase64: `${signature}AA` } } }
      root.render(<PerfilPage />)
    })

    expect(profileFields().map((field) => field.value)).toEqual(draft)
  })
})
