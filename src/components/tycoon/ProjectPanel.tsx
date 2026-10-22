import { getProductType } from '@/lib/tycoon/data/productTypes'
import { OVERSHOOT_CAP, PROJECT_SIZES } from '@/lib/tycoon/sim/balance'
import { contractBalance } from '@/lib/tycoon/sim/contracts'
import { projectQuality } from '@/lib/tycoon/sim/project'
import { isReady } from '@/lib/tycoon/sim/scoring'
import { DISCIPLINES, type Discipline, type GameState, type Office, type Project } from '@/lib/tycoon/sim/types'
import { DISCIPLINE_COLORS, DISCIPLINE_LABELS } from '@/lib/tycoon/theme'
import { formatMoney } from '@/lib/tycoon/format'
import { useGame, useOffice, useStore } from './context'
import { cssVars } from './style'
import { Routines } from './TeamControls'
import { DEFAULT_DIRECTION, DIRECTION_INFO, nextReleaseDay, nextReleasePlan, ownedProduct } from '@/lib/tycoon/sim/teams'

function Bar({ project, discipline }: { project: Project; discipline: Discipline }) {
  const progress = project.progress[discipline]
  const target = project.target[discipline]
  const done = progress >= target
  // Only products and updates can be polished past their target; client work fills to the end.
  const cap = project.kind === 'new' || project.kind === 'update' ? OVERSHOOT_CAP : 1
  const fill = Math.min(progress / (target * cap), 1) * 100

  return (
    <div className={`bar ${done ? 'done' : ''}`} style={cssVars({ '--c': DISCIPLINE_COLORS[discipline] })}>
      <div className="bar-head">
        <span>{DISCIPLINE_LABELS[discipline]}</span>
        <span className="muted">
          {Math.round(progress)} / {Math.round(target)} · {Math.round((progress / target) * 100)}%
        </span>
      </div>
      <div className="track">
        <div className="fill" style={{ width: `${fill}%` }} />
        {cap > 1 && <div className="target-mark" style={{ left: `${100 / cap}%` }} />}
      </div>
    </div>
  )
}

function Bars({ project }: { project: Project }) {
  return (
    <div className="bars">
      {DISCIPLINES.filter((d) => project.target[d] > 0).map((d) => (
        <Bar key={d} project={project} discipline={d} />
      ))}
    </div>
  )
}

function ContractPanel({ office, project }: { office: Office; project: Project }) {
  const store = useStore()
  const state = useGame()
  const terms = project.contract!
  const left = terms.dueDay - state.day
  return (
    <section className="project contract">
      <div className="project-head">
        <div>
          <strong>💼 {project.name}</strong>
          <span className={left < 0 ? 'bad' : 'muted'}>
            {' '}
            · {formatMoney(contractBalance(state, terms))} more on delivery ·{' '}
            {left >= 0 ? `due in ${left} day${left === 1 ? '' : 's'}` : `${-left} day${left === -1 ? '' : 's'} late`}
          </span>
        </div>
        <button onClick={() => store.abandonContract(office.id)}>Drop the job</button>
      </div>
      <Bars project={project} />
      <Routines office={office} />
    </section>
  )
}

export function ProjectPanel() {
  const store = useStore()
  const state = useGame()
  const office = useOffice()
  const project = office.project

  if (!project) {
    const owned = ownedProduct(state, office)
    return (
      <section className="project idle">
        <span className="muted">
          {owned && office.kind !== 'garage'
            ? `Looks after ${owned.name} (${DIRECTION_INFO[office.direction ?? DEFAULT_DIRECTION].name}): next, ${nextReleasePlan(state, office, owned)} in ${Math.max(0, nextReleaseDay(state, office, owned) - state.day)} days, unless you give the team something else.`
            : 'No project in progress. The team is burning salary.'}
        </span>
        <Routines office={office} />
        <div className="idle-actions">
          <button className="primary" onClick={() => store.openDialog({ kind: 'new-project', officeId: office.id })}>
            Start a project
          </button>
        </div>
      </section>
    )
  }
  if (project.kind === 'contract') return <ContractPanel office={office} project={project} />

  const type = getProductType(project.productTypeId)
  const ready = isReady(project)
  const quality = Math.round(projectQuality(state, project))
  // What choices during development did to the launch, e.g. "+15%"; hidden while it is unchanged.
  const hype = Math.round((project.hype - 1) * 100)

  return (
    <section className="project">
      <div className="project-head">
        <div>
          <strong>{project.name}</strong>
          <span className="muted">
            {' '}
            {project.kind === 'update' ? 'update · ' : ''}
            {PROJECT_SIZES[project.size].name} {type.name} · {project.featureIds.length} feature
            {project.featureIds.length === 1 ? '' : 's'} · day {state.day - project.startDay}
          </span>
          {hype !== 0 && (
            <span className={hype > 0 ? 'good' : 'bad'} title="Users at launch, from choices made during development">
              {' '}
              · users {hype > 0 ? '+' : ''}
              {hype}%
            </span>
          )}
        </div>
        <button className={ready ? 'primary' : ''} onClick={() => store.openDialog({ kind: 'ship', officeId: office.id })}>
          {project.kind === 'update' ? 'Release' : 'Ship'}
          {ready ? '' : ' early'} · quality {quality}
        </button>
      </div>
      <Bars project={project} />
    </section>
  )
}
