import type { ReactNode } from 'react'

type PageContainerProps = {
  title: string
  description?: string
  children?: ReactNode
  contained?: boolean
}

export function PageContainer({ title, description, children, contained = true }: PageContainerProps) {
  return (
    <section className="mx-auto w-full min-w-0 max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <p className="ui-eyebrow mb-2 text-xs font-bold uppercase tracking-[0.2em]">SM&A</p>
        <h1 className="text-2xl font-extrabold text-[var(--color-primary)] sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>}
      </div>
      {contained ? (
        <div className="ui-card rounded-2xl p-5 sm:p-6">
          {children ?? <p className="text-sm text-[var(--color-text-muted)]">Conteúdo será desenvolvido nas próximas etapas.</p>}
        </div>
      ) : children}
    </section>
  )
}
