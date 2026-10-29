import { useEffect, useState } from 'react'
import type { AssignmentSnapshot } from '../squads/types'
import { getCorporateUserId, isCorporateDataActive, listCorporatePeople, type CorporatePerson } from './corporateData'

/**
 * Login Microsoft: a própria pessoa como está no banco de dados (equipe, supervisor e cargo
 * definidos pela diretoria). Fora do login Microsoft devolve null.
 */
export function useCorporatePerson() {
  const corporate = isCorporateDataActive()
  const userId = corporate ? getCorporateUserId() : null
  const [person, setPerson] = useState<CorporatePerson | null>(null)
  const [isLoading, setLoading] = useState(Boolean(userId))

  useEffect(() => {
    if (!userId) {
      setPerson(null)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    void listCorporatePeople()
      .then((people) => { if (active) setPerson(people.find((item) => item.id === userId) ?? null) })
      .catch(() => { if (active) setPerson(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId])

  return { corporate, person, isLoading }
}

/** Equipe e supervisor do banco de dados no formato usado pelas telas. */
export function assignmentFromPerson(person: CorporatePerson | null): AssignmentSnapshot | null {
  if (!person?.teamId) return null
  return {
    squadId: person.teamId,
    squadName: person.teamName ?? 'Equipe',
    supervisorId: person.supervisorId ?? '',
    supervisorName: person.supervisorName ?? 'Não definido',
  }
}
