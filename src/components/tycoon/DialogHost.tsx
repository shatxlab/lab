import { AbsorbDialog } from './AbsorbDialog'
import { RoadmapDialog } from './RoadmapDialog'
import { useSignal, useStore } from './context'
import { BreakoutDialog, EraDialog, GameOverDialog, OfferDialog, ReadyDialog, ResultDialog, StageDialog } from './dialogs'
import { EmployeeDialog } from './EmployeeDialog'
import { EventDialog } from './EventDialog'
import { FoundingDialog } from './FoundingDialog'
import { MenuDialog } from './MenuDialog'
import { NewProjectDialog } from './NewProjectDialog'
import { ResearchDialog } from './ResearchDialog'
import { ShipDialog } from './ShipDialog'
import { StudioDialog } from './StudioDialog'
import { TeamDialog } from './TeamDialog'

export function DialogHost() {
  const dialog = useSignal(useStore().dialog)
  switch (dialog?.kind) {
    case 'new-project':
      return <NewProjectDialog updateOf={dialog.updateOf} officeId={dialog.officeId} grow={dialog.grow} />
    case 'roadmap':
      return <RoadmapDialog productId={dialog.productId} />
    case 'queue':
      return <NewProjectDialog updateOf={dialog.productId} queue />
    case 'ship':
      return <ShipDialog officeId={dialog.officeId} />
    case 'ready':
      return <ReadyDialog officeId={dialog.officeId} />
    case 'breakout':
      return <BreakoutDialog productId={dialog.productId} />
    case 'stage':
      return <StageDialog stage={dialog.stage} />
    case 'era':
      return <EraDialog era={dialog.era} />
    case 'event':
      return <EventDialog />
    case 'result':
      return (
        <ResultDialog
          productId={dialog.productId}
          reputationDelta={dialog.reputationDelta}
          early={dialog.early}
          unlocked={dialog.unlocked}
          update={dialog.update}
          reach={dialog.reach}
          bugs={dialog.bugs}
          quality={dialog.quality}
        />
      )
    case 'team':
      return <TeamDialog />
    case 'employee':
      return <EmployeeDialog id={dialog.id} />
    case 'menu':
      return <MenuDialog />
    case 'research':
      return <ResearchDialog />
    case 'studio':
      return <StudioDialog tab={dialog.tab} />
    case 'absorb':
      return <AbsorbDialog rivalId={dialog.rivalId} />
    case 'offer':
      return <OfferDialog />
    case 'founding':
      return <FoundingDialog />
    case 'game-over':
      return <GameOverDialog />
    default:
      return null
  }
}
