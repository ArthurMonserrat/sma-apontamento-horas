import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuthSync } from './AuthSync'

describe('AuthSync legado', () => {
  it('não executa mais sincronização MSAL e preserva apenas a composição dos filhos', () => {
    expect(renderToStaticMarkup(<AuthSync><p>Conteúdo</p></AuthSync>)).toBe('<p>Conteúdo</p>')
  })
})
