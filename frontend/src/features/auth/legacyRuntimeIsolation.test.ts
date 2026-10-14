import { describe, expect, it } from 'vitest'
import mainSource from '../../main.tsx?raw'
import portalSource from '../../pages/access/Portal.tsx?raw'
import profileSource from '../../pages/collaborator/PerfilPage.tsx?raw'

describe('isolamento do runtime legado', () => {
  it('não monta MSAL nem AuthSync no entrypoint corporativo', () => {
    expect(mainSource).not.toContain('msalInstance')
    expect(mainSource).not.toContain('handleRedirectPromise')
    expect(mainSource).not.toContain('MsalProvider')
  })

  it('não usa conta MSAL para exibir ou autorizar páginas internas', () => {
    expect(portalSource).not.toContain('useMsal')
    expect(profileSource).not.toContain('useMsal')
  })
})
