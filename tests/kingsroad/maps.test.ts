import { describe, expect, it } from "vitest";

import { ARENA, GATE, PLOT_RADIUS, PLOT_REACH, ROAD_HALF, TOWERS, WALL_Y } from "@/lib/kingsroad/sim/balance";
import { MAPS } from "@/lib/kingsroad/sim/maps";
import { distanceToPath, makePath, poseAt, roadWithin } from "@/lib/kingsroad/sim/path";
import { towerRadius } from "@/lib/kingsroad/render/draw";

describe("paths", () => {
  const path = makePath([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
  ]);

  it("measures a polyline and walks along it", () => {
    expect(path.length).toBe(150);
    expect(poseAt(path, 50)).toEqual({ x: 50, y: 0, angle: 0 });
    expect(poseAt(path, 125)).toMatchObject({ x: 100, y: 25 });
    expect(poseAt(path, 125).angle).toBeCloseTo(Math.PI / 2);
  });

  it("clamps to the ends", () => {
    expect(poseAt(path, -10)).toMatchObject({ x: 0, y: 0 });
    expect(poseAt(path, 999)).toMatchObject({ x: 100, y: 50 });
  });

  it("finds the distance to the nearest stretch of road", () => {
    expect(distanceToPath(path, 50, 20)).toBe(20);
    expect(distanceToPath(path, 130, 25)).toBe(30);
  });

  it("measures how much road a circle covers", () => {
    expect(roadWithin(path, 50, 0, 20, 1)).toBeGreaterThanOrEqual(40);
    expect(roadWithin(path, 50, 0, 20, 1)).toBeLessThanOrEqual(42);
  });
});

describe("maps", () => {
  for (const map of MAPS) {
    describe(map.id, () => {
      it("runs every road out of the woods and in at the gate", () => {
        for (const road of map.roads) {
          expect(road.points[0].y).toBeLessThan(0);
          expect(road.points[road.points.length - 1]).toEqual({ x: GATE.x, y: WALL_Y });
        }
      });

      it("keeps every plot on the field and its biggest tower off the road", () => {
        for (const plot of map.plots) {
          expect(plot.x - PLOT_RADIUS).toBeGreaterThanOrEqual(0);
          expect(plot.x + PLOT_RADIUS).toBeLessThanOrEqual(ARENA.width);
          expect(plot.y + PLOT_RADIUS).toBeLessThan(WALL_Y);
          for (const road of map.roads) {
            expect(distanceToPath(road, plot.x, plot.y), `${plot.x},${plot.y}`).toBeGreaterThan(ROAD_HALF + towerRadius(3));
          }
        }
      });

      it("spaces plots far enough apart for a finger to tell them apart", () => {
        for (const [index, plot] of map.plots.entries()) {
          for (const other of map.plots.slice(index + 1)) {
            expect(Math.hypot(plot.x - other.x, plot.y - other.y)).toBeGreaterThan(PLOT_REACH * 2 - 6);
          }
        }
      });

      it("puts some road in reach of every plot's archers", () => {
        for (const plot of map.plots) {
          const covered = map.roads.reduce((sum, road) => sum + roadWithin(road, plot.x, plot.y, TOWERS.archer.levels[0].range), 0);
          expect(covered, `${plot.x},${plot.y}`).toBeGreaterThan(60);
        }
      });
    });
  }
});
