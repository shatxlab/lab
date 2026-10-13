/**
 * What an unoccupied desk looks like, for hosts that leave desks empty on purpose (the Focus office),
 * so a bare desk reads as someone's day off or a spare seat rather than a missing sprite.
 *
 * - `away`: somebody's desk while they are out: the computer stays, the chair is tucked in, a mug is left behind.
 * - `bare`: a desk that never had a computer: a stack of books and a tucked-in chair.
 * - `spare`: a free hot desk: a tablet and a mug, the chair left out for whoever sits down.
 */
export type Vacancy = 'away' | 'bare' | 'spare'

/** Chosen by hand so that the desks in a row of four don't all look alike; repeats past the end. */
const PATTERN: readonly Vacancy[] = ['away', 'bare', 'spare', 'away', 'bare', 'away', 'away', 'bare', 'away', 'spare', 'bare', 'away']

/**
 * The same desk always looks the same. A desk somebody has been let go from (`vacated`) is never `away`:
 * nobody is coming back to it, so it is cleared out, as a bare desk or a spare one.
 */
export function vacancyFor(desk: number, vacated = false): Vacancy {
  const vacancy = PATTERN[desk % PATTERN.length]!
  if (!vacated || vacancy !== 'away') return vacancy
  return desk % 2 === 0 ? 'bare' : 'spare'
}

/** Does this look have a computer on the desk? */
export const hasComputer = (vacancy: Vacancy): boolean => vacancy === 'away'

/** Is the chair pushed in under the desk? */
export const chairTucked = (vacancy: Vacancy): boolean => vacancy !== 'spare'

/** How far a tucked-in chair slides toward its desk, in sprite pixels. */
export const CHAIR_TUCK = 3
