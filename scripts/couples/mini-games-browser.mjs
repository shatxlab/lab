// Start dev (4321) and production preview (4322) after npm run build.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/couples/mini-games-browser.mjs
// Optional PORTS=4322 for production only. Does not bypass production CSP.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
const checks = [];
const errors = [];
const axe = fs.readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const out = new URL('../../reports/couples/', import.meta.url).pathname;
fs.mkdirSync(out, {recursive:true});
const ports = (process.env.PORTS ?? '4321,4322').split(',').map(Number);
const phase = async p => p.locator('[data-mini-phase]').getAttribute('data-mini-phase');
const action = (p, a) => p.locator(`[data-action="${a}"]`).click();
const ready = p => p.locator('[data-handoff] button').click();
const noSecrets = async p => {
  assert.equal(await p.locator('.cp-pattern-board').count(), 0);
};
const layout = async p => {
  const issues = await p.evaluate(() => {
    const problems = [];
    if (document.documentElement.scrollWidth > innerWidth) problems.push('page horizontal overflow');
    const scroller = document.querySelector('.cp-mini-scroll');
    if (scroller && scroller.scrollWidth > scroller.clientWidth + 1) problems.push('content horizontal overflow');
    for (const button of document.querySelectorAll('.cp-mini button')) {
      if (button.getBoundingClientRect().height < 43.9) problems.push('small target: ' + button.textContent);
    }
    return problems;
  });
  assert.deepEqual(issues, []);
};
const audit = async (p, tag) => {
  await p.evaluate(axe);
  const violations = await p.evaluate(async () => (await axe.run(document.querySelector('.cp-shell'), { runOnly: {type:'tag', values:['wcag2a','wcag2aa','wcag21aa']} })).violations.map(v => ({id:v.id, impact:v.impact, nodes:v.nodes.map(n=>n.target)})));
  checks.push({ audit:tag, violations });
  assert.deepEqual(violations, [], tag);
};
try {
  for (const port of ports) for (const lang of ['en','ru']) for (const [width,height] of [[360,640],[390,780]]) {
    const context = await browser.newContext({viewport:{width,height}, serviceWorkers:'block'});
    const p = await context.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => {if(m.type()==='error') errors.push(m.text())});
    await p.addInitScript(({lang}) => {
      localStorage.setItem('lab:lang',lang);
      localStorage.setItem('lab:couples:v1', JSON.stringify({settings:{game:'norm',lang,mode:'match',theme:'all',count:10,names:['Alex','Sam'],sound:false},stats:{games:2,cards:10,matches:6}}));
    }, {lang});
    await p.goto(`http://127.0.0.1:${port}/couples/`);
    await p.locator('.cp-shell[data-lang-ready]').waitFor();
    if(port===4321) await p.addStyleTag({content:'astro-dev-toolbar { display:none !important; }'});
    assert.equal(await p.locator('.cp-game-card').count(),4);
    await p.locator('.cp-game-card').nth(3).click();
    await layout(p);
    await action(p,'start'); await noSecrets(p);
    for(let round=0;round<5;round++) {
      assert.equal(await phase(p),'handoff-study'); await noSecrets(p);
      await ready(p);
      const target = await p.locator('.cp-pattern-board [data-cell]').evaluateAll(c=>c.map(x=>Number(x.dataset.tile)));
      await layout(p);
      if((round===0 || round===4) && port===4322 && lang==='en' && width===390) {
        await p.screenshot({animations:'disabled',path:`${out}/secret-pattern-study-${round}.png`});
        await audit(p,'pattern study');
      }
      await action(p,'pass'); await noSecrets(p); await ready(p);
      await layout(p);
      if(round===4 && port===4322 && width===390) {
        await audit(p, `four-colour builder ${lang}`);
        await p.screenshot({animations:'disabled',path:`${out}/secret-pattern-build-final-${lang}.png`});
      }
      for(let i=0;i<9;i++) if(target[i]) {
        await p.locator(`[data-tool="${target[i]}"]`).click();
        await p.locator(`[data-cell="${i}"]`).click();
      }
      if(round===0) {
        if(port===4322 && lang==='ru' && width===360) {
          await layout(p); await audit(p,'pattern builder');
          await p.screenshot({animations:'disabled',path:`${out}/secret-pattern-build-ru.png`});
        }
        await action(p,'peek'); await noSecrets(p); await ready(p);
        assert.equal(await phase(p),'peek');
        assert.deepEqual(await p.locator('.cp-pattern-board [data-cell]').evaluateAll(c=>c.map(x=>Number(x.dataset.tile))),target);
        await action(p,'pass'); await noSecrets(p); await ready(p);
        assert.deepEqual(await p.locator('.cp-pattern-board [data-cell]').evaluateAll(c=>c.map(x=>Number(x.dataset.tile))),target);
      }
      await action(p,'prepare-reveal'); await noSecrets(p);
      await action(p,'reveal'); await layout(p);
      if(round===0 && port===4322 && lang==='en' && width===390) await p.screenshot({animations:'disabled',path:`${out}/secret-pattern-reveal.png`});
      await action(p,'next');
    }
    assert.equal(await phase(p),'summary');
    assert.match(await p.locator('.cp-score-value').innerText(),/25 \/ 25/);
    await layout(p); await action(p,'replay');
    assert.equal(await phase(p),'handoff-study');
    await p.locator('.cp-mini-exit').click();
    assert.equal(await p.locator('.cp-mini-layout').getAttribute('inert'),'');
    await p.keyboard.press('Tab'); assert.equal(await p.locator('.cp-danger').evaluate(e=>e===document.activeElement),true);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('[role="dialog"]').count(),0);
    assert.equal(await p.locator('.cp-mini-exit').evaluate(e=>e===document.activeElement),true);
    await p.locator('.cp-mini-exit').click(); await p.locator('[role="dialog"] .cp-danger').click();
    const stored = await p.evaluate(()=>JSON.parse(localStorage.getItem('lab:couples:v1')));
    assert.deepEqual(stored.stats,{games:2,cards:10,matches:6});
    await p.reload(); await p.locator('.cp-shell[data-lang-ready]').waitFor();
    assert.equal(await p.locator('.cp-game-card').count(),4);
    assert.equal(await p.locator('[data-mini-game]').count(),0);
    checks.push({port,lang,width,height,result:'passed'});
    console.log('PASS',port,lang,width,height);
    await context.close();
  }
  for (const [width,height] of [[1280,800],[640,360]]) {
    const context = await browser.newContext({viewport:{width,height},colorScheme:'dark',reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(() => {localStorage.setItem('lab:theme:v1','dark');localStorage.setItem('lab:lang','en')});
    const p = await context.newPage();
    p.on('pageerror',e=>errors.push(String(e)));
    await p.goto(`http://127.0.0.1:${ports.at(-1)}/couples/`);
    await p.locator('.cp-shell[data-lang-ready]').waitFor();
    await p.locator('.cp-game-card').nth(3).click(); await action(p,'start'); await ready(p); await layout(p);
    await audit(p,`dark pattern ${width}×${height}`);
    await action(p,'pass'); await ready(p); await layout(p);
    await action(p,'prepare-reveal'); await action(p,'reveal'); await layout(p);
    assert.equal(await p.locator('.cp-mini-reveal').evaluate(e=>getComputedStyle(e).animationName),'none');
    await p.locator('.cp-mini-exit').click(); await p.locator('[role="dialog"] .cp-danger').click();
    checks.push({width,height,theme:'dark',reducedMotion:true,result:'passed'});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`${out}/mini-games-browser-check.json`,JSON.stringify({checks,errors},null,2));
} finally { await browser.close(); }
