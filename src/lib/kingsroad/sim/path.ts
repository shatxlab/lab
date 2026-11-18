/** A road as a polyline, measured once so a walker's position is just a distance along it. */
export interface Point {
  x: number;
  y: number;
}

export interface Path {
  points: readonly Point[];
  /** Distance from the start to each point. */
  marks: readonly number[];
  length: number;
}

export interface PathPose {
  x: number;
  y: number;
  /** Heading along the road, radians. */
  angle: number;
}

export function makePath(points: readonly Point[]): Path {
  const marks = [0];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    marks.push(marks[index - 1] + Math.hypot(to.x - from.x, to.y - from.y));
  }
  return { points, marks, length: marks[marks.length - 1] };
}

/** Where on the road a walker is after `distance`, clamped to the two ends. */
export function poseAt(path: Path, distance: number): PathPose {
  const { points, marks } = path;
  const along = Math.min(path.length, Math.max(0, distance));
  let index = 1;
  while (index < points.length - 1 && marks[index] < along) index += 1;
  const from = points[index - 1];
  const to = points[index];
  const span = marks[index] - marks[index - 1] || 1;
  const t = (along - marks[index - 1]) / span;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, angle: Math.atan2(to.y - from.y, to.x - from.x) };
}

/** Shortest distance from a point to the road. */
export function distanceToPath(path: Path, x: number, y: number): number {
  let best = Infinity;
  for (let index = 1; index < path.points.length; index += 1) {
    best = Math.min(best, distanceToSegment(path.points[index - 1], path.points[index], x, y));
  }
  return best;
}

/** How much of the road lies within `radius` of a point, sampled every few units. */
export function roadWithin(path: Path, x: number, y: number, radius: number, step = 4): number {
  let covered = 0;
  for (let along = 0; along <= path.length; along += step) {
    const pose = poseAt(path, along);
    if (Math.hypot(pose.x - x, pose.y - y) <= radius) covered += step;
  }
  return covered;
}

function distanceToSegment(a: Point, b: Point, x: number, y: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared));
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}
