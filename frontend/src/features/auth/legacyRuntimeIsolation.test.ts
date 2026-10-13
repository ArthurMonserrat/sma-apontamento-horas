import { describe, expect, it } from 'vitest'
import mainSource from '../../main.tsx?raw'
import portalSource from '../../pages/access/Portal.tsx?raw'
import profileSource from '../../pages/collaborator/PerfilPage.tsx?raw'

describe('inicialização do MSAL no runtime', () => {
  it('inicializa o MSAL antes de montar o entrypoint', () => {
    expect(mainSource).toContain('msalInstance.initialize()')
    expect(mainSource).toContain('handleRedirectPromise')
    expect(mainSource).toContain('MsalProvider')
  })

  it('não usa conta MSAL para exibir ou autorizar páginas internas', () => {
    expect(portalSource).not.toContain('useMsal')
    expect(profileSource).not.toContain('useMsal')
  })
})
