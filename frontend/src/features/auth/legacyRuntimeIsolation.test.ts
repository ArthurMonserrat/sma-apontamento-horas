import { describe, expect, it } from 'vitest'
import mainSource from '../../main.tsx?raw'
import portalSource from '../../pages/access/Portal.tsx?raw'
import profileSource from '../../pages/collaborator/PerfilPage.tsx?raw'

describe('isolamento do MSAL legado no runtime', () => {
  it('não inicializa callback ou provider MSAL no entrypoint', () => {
    expect(mainSource).not.toContain('handleRedirectPromise')
    expect(mainSource).not.toContain('MsalProvider')
  })

  it('não usa conta MSAL para exibir ou autorizar páginas internas', () => {
    expect(portalSource).not.toContain('useMsal')
    expect(profileSource).not.toContain('useMsal')
  })
})
