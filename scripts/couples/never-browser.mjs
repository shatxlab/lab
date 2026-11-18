// npm run build && npm run preview -- --port 4322
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/couples/never-browser.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({headless:true});
const port = process.env.PORT ?? '4322';
const out = new URL('../../reports/couples/', import.meta.url).pathname;
const axe = fs.readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url),'utf8');
fs.mkdirSync(out,{recursive:true});
const checks = [], errors = [];
const action = (p,a) => p.locator(`[data-action="${a}"]`).click();
const answer = (p,player,value) => p.locator(`[data-never-player="${player}"][data-answer="${value}"]`).click();
const layout = async p => {
  const issues = await p.evaluate(() => {
    const issues = [];
    if(document.documentElement.scrollWidth > innerWidth) issues.push('horizontal page overflow');
    const scroll = document.querySelector('.cp-mini-scroll');
    if(scroll && scroll.scrollWidth > scroll.clientWidth + 1) issues.push('horizontal content overflow');
    for (const b of document.querySelectorAll('.cp-mini button, .cp-never-deck, .cp-never-count select')) {
      if(b.getBoundingClientRect().height < 43.9) issues.push('small touch target: ' + b.textContent);
    }
    return issues;
  });
  assert.deepEqual(issues,[]);
};
const audit = async (p,tag) => {
  await p.evaluate(axe);
  const violations = await p.evaluate(async () => (await axe.run(document.querySelector('.cp-shell'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
  assert.deepEqual(violations,[],tag); checks.push({audit:tag,violations});
};
const unchanged = async p => {
  const stored = await p.evaluate(() => ({data:JSON.parse(localStorage.getItem('lab:couples:v1')),keys:Object.keys(localStorage).sort(),history:JSON.parse(localStorage.getItem('lab:couples:history:v1'))}));
  assert.deepEqual(stored.history,{seq:2,seen:{'norm:old':2},hidden:['who:hidden']});
  assert.deepEqual(stored.data.stats,{games:2,cards:10,matches:6});
  assert.deepEqual(stored.keys,['lab:couples:history:v1','lab:couples:v1','lab:lang', 'lab:theme:v1']);
  assert(!JSON.stringify(stored.data).match(/answers|followUp|never-|explored/));
};
try {
  for(const lang of ['en','ru']) for(const [width,height,theme] of [[360,640,'light'],[390,780,'light'],[390,780,'dark'],[640,360,'dark']]) {
    const context = await browser.newContext({viewport:{width,height},colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(({lang,theme}) => {
      localStorage.setItem('lab:couples:history:v1',JSON.stringify({seq:2,seen:{'norm:old':2},hidden:['who:hidden']}));
      localStorage.setItem('lab:lang',lang); localStorage.setItem('lab:theme:v1',theme);
      localStorage.setItem('lab:couples:v1',JSON.stringify({settings:{game:'norm',lang,mode:'match',theme:'all',count:10,names:['Alex','Sam'],sound:false},stats:{games:2,cards:10,matches:6}}));
    },{lang,theme});
    const p = await context.newPage();
    p.on('pageerror',e=>errors.push(String(e)));
    p.on('console',m=>{if(m.type()==='error') errors.push(m.text())});
    await p.goto(`http://127.0.0.1:${port}/couples/`); await p.locator('.cp-shell[data-lang-ready]').waitFor();
    assert.equal(await p.locator('.cp-game-card').count(),5);
    await p.locator('.cp-game-card').nth(4).click();
    assert.equal(await p.locator('input[value="mix"]').isChecked(),true);
    assert.equal(await p.locator('input[value="closer"]').isChecked(),false);
    await layout(p); await audit(p,`setup ${lang} ${width} ${theme}`);
    if(width===390 && theme==='light') await p.screenshot({path:`${out}/never-setup-${lang}.png`});
    await p.locator('select').selectOption('10'); await action(p,'start');
    const prompts = new Set();
    for(let i=0;i<10;i++) {
      const prompt = await p.locator('.cp-never-prompt h2').innerText(); prompts.add(prompt);
      assert(!await p.locator('.cp-never-players [aria-pressed="true"]').count());
      if(i===0) {
        // Keyboard activation, then skip after one answer; neither answer persists.
        const first = p.locator('[data-never-player="0"][data-answer="have"]'); await first.focus(); await p.keyboard.press('Enter');
        assert.equal(await first.getAttribute('aria-pressed'),'true');
        await layout(p); await audit(p,`answer ${lang} ${width} ${theme}`);
        if(width===390 && theme==='light') await p.screenshot({path:`${out}/never-card-${lang}.png`});
        await action(p,'never-skip'); continue;
      }
      await answer(p,0,'never'); await answer(p,1,'have');
      await p.locator('.cp-never-story').waitFor();
      if(i===1) {
        await answer(p,0,'have');
        assert.equal(await p.locator('[data-never-player="0"][data-answer="have"]').getAttribute('aria-pressed'),'true');
        await layout(p); await audit(p,`story ${lang} ${width} ${theme}`);
        if(width===390 && theme==='light') await p.screenshot({path:`${out}/never-story-${lang}.png`});
        await action(p,'never-skip'); continue;
      }
      await action(p,'never-next');
    }
    assert.equal(prompts.size,10);
    assert.equal(await p.locator('[data-never-phase]').getAttribute('data-never-phase'),'summary');
    assert.equal(await p.locator('.cp-never-prompt, .cp-never-players, .cp-never-story').count(),0);
    const text = await p.locator('.cp-never').innerText(); assert(text.includes(': 8')); assert(text.includes(': 2')); assert(!text.includes('%'));
    for(const prompt of prompts) assert(!text.includes(prompt));
    await unchanged(p); await layout(p); await audit(p,`summary ${lang} ${width} ${theme}`);
    await action(p,'replay');
    assert.equal(await p.locator('[data-never-phase]').getAttribute('data-never-phase'),'answer');
    assert.equal(await p.locator('.cp-never-players [aria-pressed="true"]').count(),0);
    await answer(p,0,'have'); await p.locator('.cp-mini-exit').click();
    await p.keyboard.press('Tab'); assert(await p.locator('.cp-danger').evaluate(e=>e===document.activeElement));
    await p.keyboard.press('Escape'); assert(await p.locator('.cp-mini-exit').evaluate(e=>e===document.activeElement));
    assert.equal(await p.locator('[data-never-player="0"][data-answer="have"]').getAttribute('aria-pressed'),'true');
    await p.locator('.cp-mini-exit').click(); await p.locator('[role="dialog"] .cp-danger').click();
    await p.locator('.cp-game-card').nth(4).click();
    await p.locator('input[value="closer"]').check(); await p.locator('select').selectOption('10'); await action(p,'start');
    for(let i=0;i<10;i++) await action(p,'never-skip');
    assert.equal(await p.locator('[data-never-phase]').getAttribute('data-never-phase'),'summary');
    assert((await p.locator('.cp-never').innerText()).includes(': 10'));
    await unchanged(p); await p.reload(); await p.locator('.cp-shell[data-lang-ready]').waitFor();
    assert.equal(await p.locator('.cp-game-card').count(),5); assert.equal(await p.locator('[data-never-phase]').count(),0);
    checks.push({lang,width,height,theme,result:'passed'}); console.log('PASS',lang,width,height,theme);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`${out}/never-browser-check.json`,JSON.stringify({checks,errors},null,2));
} finally { await browser.close(); }
