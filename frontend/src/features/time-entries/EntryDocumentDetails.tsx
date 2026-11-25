import type { TimeEntry } from './types'

export function EntryDocumentDetails({ entry }: { entry: TimeEntry }) {
  if (!entry.contractorNumber && !entry.ldDocument) return null
  return <dl className="mt-3 space-y-1 break-words text-sm ui-text-muted">
    {entry.contractorNumber && <div><dt className="inline font-bold">Número do projeto / obra: </dt><dd className="inline">{entry.contractorNumber}</dd></div>}
    {entry.ldDocument && <>
      <div><dt className="inline font-bold">Nº VALE: </dt><dd className="inline">{entry.ldDocument.valeNumber}</dd></div>
      <div><dt className="inline font-bold">Documento: </dt><dd className="inline">{entry.ldDocument.title}</dd></div>
      <div><dt className="inline font-bold">Arquivo LD: </dt><dd className="inline">{entry.ldDocument.fileName}</dd></div>
    </>}
  </dl>
}
