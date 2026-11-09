import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Plugin } from "esbuild";
import { variantBalanceSource, variantBulwarkBalanceSource, variantBulwarkWavesSource, variantRosterSource, variantSource, variantTypesSource, variantWavesSource, type Variant } from "./variant.ts";

/** Fail closed when the shipping source changes; never maintain a second combat implementation. */
export function instrumentSource(source: string, observerPath: string): string {
  const replace = (anchor: string, replacement: string) => {
    if (source.split(anchor).length !== 2) throw new Error(`Study anchor must occur exactly once: ${anchor}`);
    source = source.replace(anchor, replacement);
  };
  replace('function hitFoe(foe: Foe,', 'function hitFoe(game: Game, source: { id: number; kind?: TowerKind }, foe: Foe,');
  replace('hitFoe(target, shot.damage, shot.slow, shot.burn > 0);', 'hitFoe(game, shot, target, shot.damage, shot.slow, shot.burn > 0);');
  // Splash is called once by homing frost, and once by a stone, with distinct arguments.
  replace('hitFoe(foe, shot.damage, shot.slow);', 'hitFoe(game, shot, foe, shot.damage, shot.slow);');
  replace('<= shot.splash + foe.radius * 0.5) hitFoe(foe, shot.damage, 0);', '<= shot.splash + foe.radius * 0.5) hitFoe(game, shot, foe, shot.damage, 0);');
  replace('hitFoe(foe, volley.damage, 0);', 'hitFoe(game, volley, foe, volley.damage, 0);');
  replace('\n    hitFoe(foe, shot.damage, 0);', '\n    hitFoe(game, shot, foe, shot.damage, 0);');
  replace('  foe.hp -= dealt * (foe.markLeft > 0 ? 1 + MARK.bonus : 1);', '  observeHit(game, source, foe, damage, raw, dealt, dealt * (foe.markLeft > 0 ? 1 + MARK.bonus : 1));\n  foe.hp -= dealt * (foe.markLeft > 0 ? 1 + MARK.bonus : 1);');
  replace('      foe.hp -= BURN.dps * (1 + (foe.markLeft > 0 ? MARK.bonus : 0)) * Math.min(dt, foe.burnLeft);', '      observeBurn(game, foe, BURN.dps * (1 + (foe.markLeft > 0 ? MARK.bonus : 0)) * Math.min(dt, foe.burnLeft));\n      foe.hp -= BURN.dps * (1 + (foe.markLeft > 0 ? MARK.bonus : 0)) * Math.min(dt, foe.burnLeft);');
  replace('  if (shot.burn > 0 && !FOES[target.kind].fireproof) target.burnLeft = shot.burn;', '  if (shot.burn > 0 && !FOES[target.kind].fireproof) { target.burnLeft = shot.burn; observeBurnOwner(game, target, shot); }');
  replace('  game.shots.push(shot);', '  observeShot(game, tower, shot);\n  game.shots.push(shot);');
  replace('    if (keep) flying.push(shot);', '    if (!keep) observeRetire(game, shot.id);\n    if (keep) flying.push(shot);');
  replace('  game.volleyLeft = VOLLEY.cooldown;', '  observeCast(game, game.volleys.slice(-VOLLEY.arrows));\n  game.volleyLeft = VOLLEY.cooldown;');
  replace('    addEffect(game, "puff", volley.toX, volley.toY, 7, 0.35, DUST);', '    observeRetire(game, volley.id);\n    addEffect(game, "puff", volley.toX, volley.toY, 7, 0.35, DUST);');
  replace('  game.foes.push(foe);', '  observeSpawn(game, foe);\n  game.foes.push(foe);');
  replace('      game.lives -= FOES[foe.kind].leak;', '      observeLeak(game, foe);\n      game.lives -= FOES[foe.kind].leak;');
  replace('      ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * rate * STEP);', '      observeHeal(game, Math.min(ally.maxHp, ally.hp + ally.maxHp * rate * STEP) - ally.hp);\n      ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * rate * STEP);');
  replace('    game.kills += 1;', '    observeKill(game, foe);\n    game.kills += 1;');
  replace('  if (!target) return;\n  tower.aim', '  observeCoverage(game, tower, Boolean(target), dt);\n  if (!target) return;\n  tower.aim');
  replace('    foe.distance += foe.speed * (1 - foe.slow) * dt;', '    observeSlow(game, foe.slow * dt);\n    foe.distance += foe.speed * (1 - foe.slow) * dt;');
  return `import { observeHit, observeBurn, observeBurnOwner, observeShot, observeRetire, observeCast, observeSpawn, observeLeak, observeHeal, observeKill, observeCoverage, observeSlow } from ${JSON.stringify(observerPath)};\nexport const AUDIT_BUILD = true;\n${source}`;
}

export function studyPlugin(root = process.cwd(), variant: Variant = "baseline"): Plugin {
  return {
    name: "kingsroad-study-only-observers",
    setup(build) {
      // One shared in-memory balance module reaches combat AND bot plot ranking. Never mutate an imported object.
      build.onLoad({ filter: /[/\\]kingsroad[/\\]sim[/\\]balance\.ts$/ }, async (args) => ({
        contents: variantBulwarkBalanceSource(variantBalanceSource(await readFile(args.path, "utf8"), variant), variant), loader: "ts", resolveDir: dirname(args.path),
      }));
      // Spawn spacing is the only input of the cadence arm; the table is read from the same in-memory waves module.
      build.onLoad({ filter: /[/\\]kingsroad[/\\]sim[/\\]waves\.ts$/ }, async (args) => ({
        contents: variantBulwarkWavesSource(variantRosterSource(variantWavesSource(await readFile(args.path, "utf8"), variant), variant), variant), loader: "ts", resolveDir: dirname(args.path),
      }));
      build.onLoad({ filter: /[/\\]kingsroad[/\\]sim[/\\]types\.ts$/ }, async (args) => ({
        contents: variantTypesSource(await readFile(args.path, "utf8"), variant), loader: "ts", resolveDir: dirname(args.path),
      }));
      build.onLoad({ filter: /[/\\]study[/\\](instrumented-game|variant-game)\.ts$/ }, async (args) => {
        const path = resolve(root, "src/lib/kingsroad/sim/game.ts");
        const source = variantSource(await readFile(path, "utf8"), variant);
        const body = args.path.endsWith("instrumented-game.ts")
          ? instrumentSource(source, resolve(root, "scripts/kingsroad/study/telemetry.ts")) : source;
        return { contents: `export const STUDY_VARIANT = ${JSON.stringify(variant)};\n${body}`, loader: "ts", resolveDir: dirname(path) };
      });
    },
  };
}
