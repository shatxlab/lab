/**
 * A uniform grid over the arena for "which foes are near here". Rebuilt from scratch every tick, which is simpler than
 * moving foes between cells and cheap at a few hundred foes. It lives outside the run, so the run stays plain JSON.
 */
export interface Placed {
  x: number;
  y: number;
  radius: number;
}

export class Grid<T extends Placed> {
  private readonly cells: T[][];
  private readonly columns: number;
  private readonly rows: number;

  constructor(
    width: number,
    height: number,
    private readonly cell: number,
  ) {
    this.columns = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.cells = Array.from({ length: this.columns * this.rows }, () => []);
  }

  private column(x: number): number {
    return Math.min(this.columns - 1, Math.max(0, Math.floor(x / this.cell)));
  }

  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell)));
  }

  /** Files every item by its centre. */
  rebuild(items: readonly T[]): void {
    for (const cell of this.cells) cell.length = 0;
    for (const item of items) this.cells[this.row(item.y) * this.columns + this.column(item.x)].push(item);
  }

  /**
   * Calls `visit` for every item whose circle overlaps the circle at (x, y). `pad` widens the search to cover the
   * biggest item's radius, since items are filed by their centre only.
   */
  near(x: number, y: number, radius: number, pad: number, visit: (item: T) => void): void {
    const reach = radius + pad;
    for (let row = this.row(y - reach); row <= this.row(y + reach); row += 1) {
      for (let column = this.column(x - reach); column <= this.column(x + reach); column += 1) {
        for (const item of this.cells[row * this.columns + column]) {
          const dx = item.x - x;
          const dy = item.y - y;
          const touch = radius + item.radius;
          if (dx * dx + dy * dy <= touch * touch) visit(item);
        }
      }
    }
  }
}
