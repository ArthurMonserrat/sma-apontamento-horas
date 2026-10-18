# Contrato de confiança Entra ID ↔ Supabase Auth — Etapa 3B.2A

## Status

Esta entrega prepara uma fronteira server-side, mas **não comprova uma identidade Microsoft em produção e não habilita autorização corporativa**. `CORPORATE_AUTHORIZATION_IMPLEMENTED` permanece `false`; `/api/provision` e `/api/supabase-session` continuam bloqueados.

## Fluxo atual

```text
Microsoft Entra ID → Supabase OAuth Azure/PKCE → sessão Supabase
                                      ↓
                         auth.users + auth.identities
                                      ↓
                         SM&A (autorização bloqueada)
```

O backend valida a sessão Supabase pelo bearer token. A identidade OAuth do Supabase pode conter `user_id`, `provider`, `provider_id` e `identity_data`. `user_id` é útil para confirmar a associação com o mesmo `auth.users.id`; `provider_id` isolado não é aceito como `oid` e não fornece, por contrato, o `tid`. Também não se presume que `provider_id`, `sub` e `oid` tenham o mesmo valor.

## Estratégias avaliadas

### 1. Identidade registrada pelo Supabase Auth

- **Evidência:** vínculo `auth.identities.user_id` → `auth.users.id` mantido pelo Supabase.
- **Limite:** a produção inspecionada não possui identidade `azure`; além disso, a documentação não garante que `provider_id` contenha o par Entra `tid`/`oid` necessário para pré-autorização.
- **Risco:** confiar em `identity_data`, e-mail ou `provider_id` como se fossem claims verificadas permitiria substituição ou associação incorreta.
- **Decisão:** usar apenas para confirmar o vínculo do usuário, nunca como autorização isolada.

### 2. Verificador server-side de token Microsoft

- **Evidência necessária:** token correto para o recurso, assinatura validada por JWKS, `iss`, `aud`, expiração e nonce (quando aplicável), tenant permitido e `oid` presente.
- **Vínculo obrigatório:** a evidência Microsoft deve corresponder ao mesmo `auth.users.id` e ser explicitamente vinculada, pelo adaptador server-side, ao registro de identidade Azure (`auth.identities.id`). Essa vinculação não será inferida comparando `provider_id` com `sub` ou `oid`.
- **Riscos:** tratar access token do Graph como ID token, aceitar o endpoint `common`, aceitar claims apenas decodificadas ou combinar tokens de usuários diferentes.
- **Decisão:** é a estratégia recomendada, mas permanece indisponível até a TI/Supabase confirmarem a fonte segura do token e a configuração do provedor.

## Implementação local

`server/entraIdentityVerifier.ts` rejeita:

- objetos do navegador, e-mail e `user_metadata`;
- `provider_id` sem evidência Microsoft verificada ou tratado como equivalente a `sub`/`oid`;
- booleanos como `cryptographicallyVerified`;
- identidade Azure de outro usuário Supabase;
- múltiplas identidades Azure ambíguas;
- tenant ou object ID incompatíveis.

O resultado `verified` só pode ser produzido com uma marca opaca privada criada pelo futuro adaptador server-side, contendo o identificador do registro `auth.identities` que ele validou. Não existe produtor ativado nesta etapa, portanto entradas externas resultam em `invalid` ou `unavailable`.

## Preparação 3B.3B

A Etapa 3B.3B adiciona um verificador server-side isolado em
`server/microsoftTokenVerifier.ts`. Nos testes, ele valida tokens de teste
assinados com RS256 por uma JWKS local e exige issuer e audience exatos,
tenant permitido, `oid`, `sub`, `exp`, `nbf` quando presente, nonce quando
configurado e a condição aplicável de `xms_edov`. O verificador não recebe
claims do navegador, não decodifica JWT como prova e não retorna cargo,
profile ou autorização.

O vínculo Supabase continua deliberadamente indisponível. O backend primeiro
precisa validar a sessão Supabase e obter, no servidor, a linha de
`auth.identities` cujo `user_id` seja o mesmo `auth.users.id`. Ainda assim,
`provider_id` não é tratado como `oid` ou `sub`: a equivalência não é
garantida pelo contrato documentado. O adaptador futuro deverá demonstrar a
semântica do sujeito Microsoft e vincular a evidência criptográfica ao
`auth.identities.id`; até essa confirmação, o resultado é `unavailable` e
nenhum acesso é concedido.

Os testes positivos usam somente chaves e tokens sintéticos. Eles demonstram
validação criptográfica do componente, não homologação do tenant corporativo,
do provedor Azure no Supabase ou do Supabase gerenciado.

## Dependências da TI/Supabase

Antes da Etapa 3B.2B, confirmar:

1. Aplicativo Entra single-tenant e tenant permitido.
2. Client ID/audience e issuer/JWKS oficiais.
3. Escopos `openid profile email`.
4. Política para convidados e contas de outros tenants.
5. Redirect URIs do Supabase Auth e do HashRouter.
6. Componente server-side responsável pela validação criptográfica.
7. Como `tid` e `oid` verificados serão vinculados ao mesmo `auth.users.id` sem expor tokens ao navegador.
8. Qual campo do registro Azure em `auth.identities` representa o sujeito
   Microsoft no fluxo efetivamente configurado, com evidência documental do
   provedor; não basta fornecer um `provider_id` sem semântica comprovada.

## Testes isolados necessários

Devem cobrir sessão ausente/inválida, tenant incorreto, `oid` ausente ou divergente, issuer/audience inválidos, token expirado, assinatura inválida, identidade não vinculada, identidades múltiplas, conta convidada e troca de conta. Mocks não equivalem à homologação Microsoft real.

## Critério para a Etapa 3B.2B

A próxima etapa só poderá implementar provisionamento quando houver uma evidência verificável de `tid`/`oid` ligada ao mesmo usuário Supabase. Até lá, nenhuma pré-autorização, cargo, profile ou módulo corporativo pode ser liberado.

## Referências oficiais

- [Supabase — Auth identities](https://supabase.com/docs/guides/auth/identities)
- [Supabase — Azure login](https://supabase.com/docs/guides/auth/social-login/auth-azure)
- [Microsoft — ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)
- [Microsoft — claims validation](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation)
- [Microsoft — access token claims](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference)
