/**
 * What someone pins to the partition behind their desk: a flag, a framed picture or a note, or nothing at
 * all. It is theirs, not the desk's: it goes up when they sit down and comes down when they leave.
 */

export type Keepsake = 'flagUs' | 'flagIndia' | 'flagUk' | 'picture' | 'note'

/** Chosen by hand so that a few people hired one after another don't all look alike; repeats by id. */
const PATTERN: readonly (Keepsake | null)[] = ['flagUs', 'picture', null, 'note', 'flagIndia', null, 'picture', 'flagUk', null]

/** The same person always pins up the same thing. */
export const keepsakeFor = (id: number): Keepsake | null => PATTERN[((id % PATTERN.length) + PATTERN.length) % PATTERN.length]!

/** Width of a partition. */
const PARTITION_WIDTH = 79
/** A keepsake hangs this far in from the end of the partition: past its frame and one pixel more. */
const MARGIN = 2
/** The top of a keepsake, in rows down from the top of its partition. */
export const KEEPSAKE_TOP = 5

/**
 * The column of a keepsake `width` wide from its partition's left edge. It goes in the outer corner, behind
 * the person's back, which is the only part of the partition their head leaves in view.
 */
export const keepsakeX = (right: boolean, width: number): number => (right ? PARTITION_WIDTH - MARGIN - width : MARGIN)
