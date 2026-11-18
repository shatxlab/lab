// npm run build && npm run preview -- --port 4322
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/crossword/expanded-browser.mjs
// Local production-preview only. Simulates visualViewport keyboard resizing;
// headless Chromium cannot open a real OS keyboard.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const out = new URL('../../reports/crossword/',import.meta.url).pathname;
fs.mkdirSync(out,{recursive:true});
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'crossword-browser-'));
for(const name of ['wordbank','puzzles','legacy-puzzles','grid','i18n']) {
  const source=fs.readFileSync(new URL(`../../src/lib/crossword/${name}.ts`,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"./wordbank"','"./wordbank.mjs"');
  fs.writeFileSync(path.join(temp,`${name}.mjs`),code);
}
const {CROSSWORD_PUZZLES:catalog}=await import(`file://${temp}/puzzles.mjs`);
const {LEGACY_CROSSWORD_PUZZLES:legacy}=await import(`file://${temp}/legacy-puzzles.mjs`);
const {buildPuzzle}=await import(`file://${temp}/grid.mjs`);
const {stringsFor}=await import(`file://${temp}/i18n.mjs`);
const axe=fs.readFileSync(new URL('../../node_modules/axe-core/axe.min.js',import.meta.url),'utf8');
const errors=[],checks=[];
const browser=await chromium.launch({headless:true});
const origin=`http://127.0.0.1:${process.env.PORT??'4322'}/crossword/`;
const storageKey='lab:crossword:v1';
const boardKey=(r,c)=>`${r}:${c}`;
const open=async(p,id)=>{await p.locator(`[data-puzzle-id="${id}"]`).click();await p.locator('.cw-grid-viewport').waitFor();};
const back=async(p,T)=>p.getByRole('button',{name:T.back,exact:true}).click();
const visibleActive=async p=>{
  const r=await p.evaluate(()=>{
    const v=document.querySelector('.cw-grid-viewport'),c=v.querySelector('.cw-cell.is-active');
    const a=c.getBoundingClientRect(),b=v.getBoundingClientRect();
    return {left:a.left-b.left,top:a.top-b.top,right:b.left+v.clientWidth-a.right,bottom:b.top+v.clientHeight-a.bottom,height:v.clientHeight};
  });
  assert(r.height>=44,`viewport too short ${JSON.stringify(r)}`);
  assert(Object.entries(r).filter(([k])=>k!=='height').every(([,v])=>v>=-2),`active cell clipped ${JSON.stringify(r)}`);
};
const layout=async p=>{
  const result=await p.evaluate(()=>({pageOverflow:document.documentElement.scrollWidth>innerWidth,board:document.querySelector('.cw-board').getBoundingClientRect().toJSON(),screen:{width:innerWidth,height:innerHeight},controls:[...document.querySelectorAll('.cw-clue-nav,.cw-zoom-controls button')].filter(b=>b.getClientRects().length).map(b=>({name:b.getAttribute('aria-label'),h:b.getBoundingClientRect().height,w:b.getBoundingClientRect().width}))}));
  assert.equal(result.pageOverflow,false);
  assert(result.board.left>=-1 && result.board.right<=result.screen.width+1);
  for(const c of result.controls)assert(c.h>=43.9&&c.w>=43.9,`small target ${JSON.stringify(c)}`);
};
const audit=async(p,tag)=>{
  await p.evaluate(axe);
  const violations=await p.evaluate(async()=> (await axe.run(document.querySelector('.cw-shell'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
  checks.push({audit:tag,violations});assert.deepEqual(violations,[],tag);
};
try {
  for(const lang of ['en','ru'])for(const [width,height,theme]of [[360,640,'light'],[390,780,'light'],[1280,800,'dark'],[640,360,'dark']]){
    const T=stringsFor(lang),old=buildPuzzle(legacy[lang][0]);
    const oldCell=old.cells.find(c=>!c.isBlack),oldKey=boardKey(oldCell.row,oldCell.col);
    const oldSave={values:{[oldKey]:oldCell.solution},revealed:[],assistanceCount:3,elapsed:37,completed:false};
    const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(({lang,theme,key,oldId,oldSave})=>{
      if(!sessionStorage.getItem('crossword-test-seeded')){
        localStorage.clear();localStorage.setItem('lab:lang',lang);localStorage.setItem('lab:theme:v1',theme);localStorage.setItem(key,JSON.stringify({[oldId]:oldSave}));sessionStorage.setItem('crossword-test-seeded','1');
      }
      let inset=0;const vv=new EventTarget();Object.defineProperties(vv,{height:{get:()=>innerHeight-inset},width:{get:()=>innerWidth},offsetTop:{get:()=>0}});
      Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});window.__setKeyboardInset=value=>{inset=value;vv.dispatchEvent(new Event('resize'));};
    },{lang,theme,key:storageKey,oldId:old.puzzle.id,oldSave});
    const p=await context.newPage();p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await p.goto(origin);await p.locator('.cw-shell[data-lang-ready]').waitFor();
    await p.locator(`[data-puzzle-id="${old.puzzle.id}"]`).waitFor();
    assert.equal(await p.locator('.cw-card').count(),51);
    const counts=await p.locator('.cw-card').evaluateAll(cards=>cards.slice(0,50).map(c=>Number(c.dataset.words)));
    assert.deepEqual(counts,catalog[lang].map(c=>c.entries.length));assert.equal(counts[0],10);assert.equal(counts.at(-1),50);
    assert((await p.locator(`[data-puzzle-id="${old.puzzle.id}"]`).innerText()).toLowerCase().includes(T.legacyEdition.toLowerCase()));
    // Existing progress remains playable, with exactly the original layout.
    await open(p,old.puzzle.id);assert.equal(await p.locator(`[data-cell="${oldKey}"] .cw-cell-letter`).innerText(),oldCell.solution);
    assert.equal(await p.locator('.cw-tool-count').innerText(),'3');await back(p,T);
    for(const index of [0,49]){
      const puzzle=catalog[lang][index],built=buildPuzzle(puzzle);
      await open(p,puzzle.id);await layout(p);await visibleActive(p);
      assert.equal(await p.locator('.cw-cell-letter').allTextContents().then(a=>a.join('')),'');
      assert(await p.locator('.cw-cell.is-active').evaluate(c=>c.getBoundingClientRect().width>=43.9));
      assert.equal(await p.locator('.cw-input').getAttribute('lang'),lang);
      await p.locator('.cw-cell.is-active').click();
      if(index===0){
        const entry=built.entries[0],first=entry.cells[0],second=entry.cells[1];
        await p.locator('.cw-input').fill(entry.answer.slice(0,2));await p.keyboard.press('Backspace');
        assert.equal(await p.locator(`[data-cell="${boardKey(first.row,first.col)}"] .cw-cell-letter`).innerText(),entry.answer[0]);
        assert.equal(await p.locator(`[data-cell="${boardKey(second.row,second.col)}"] .cw-cell-letter`).innerText(),'');
        await p.locator('.cw-tool-button').nth(1).click();
        await p.locator('.cw-tool-button').nth(3).click();await p.locator('.cw-danger-button').click();
        assert.equal(await p.locator('.cw-cell-letter').allTextContents().then(a=>a.join('')),'');
        assert.equal(await p.locator('.cw-tool-count').innerText(),'1');
        await p.locator('.cw-cell.is-active').click();
      }
      await p.locator('.cw-input').evaluate(el=>{window.__crosswordInput=el;});
      if(width<700){await p.locator('[data-zoom="in"]').tap();await p.locator('[data-zoom="out"]').tap();}
      else{await p.locator('[data-zoom="in"]').click();await p.locator('[data-zoom="out"]').click();}
      assert(await p.locator('.cw-input').evaluate(el=>el===window.__crosswordInput&&el===document.activeElement));
      await p.locator('[data-zoom="fit"]').click();assert.equal(await p.locator('.cw-grid-viewport').getAttribute('data-view'),'fit');
      const fit=await p.locator('.cw-grid-viewport').evaluate(v=>({sw:v.scrollWidth,w:v.clientWidth,sh:v.scrollHeight,h:v.clientHeight}));
      assert(fit.sw<=fit.w+1&&fit.sh<=fit.h+1,`overview overflow ${JSON.stringify(fit)}`);
      if(index===49&&width===390)await p.screenshot({path:`${out}/expanded-overview-${lang}.png`,animations:'disabled'});
      const far=built.cells.filter(c=>!c.isBlack).at(-1);
      const farTarget=p.locator(`[data-cell="${boardKey(far.row,far.col)}"]`);
      // A 1px landscape overview is for orientation, not individual hit targets.
      // Return to readable size before selecting; never use a forced click.
      if(await farTarget.evaluate(el=>el.getBoundingClientRect().width)<6) await p.locator('[data-zoom="fit"]').click();
      await farTarget.click();
      assert.equal(await p.locator('.cw-grid-viewport').getAttribute('data-view'),'readable');await visibleActive(p);
      await p.keyboard.press('Tab');await visibleActive(p);await p.keyboard.press('Shift+Tab');await visibleActive(p);
      // Simulate OS keyboard visual-viewport changes, including cramped landscape.
      await p.evaluate(inset=>window.__setKeyboardInset(inset),height<=400?160:260);
      await p.waitForTimeout(100);await visibleActive(p);await layout(p);
      assert(await p.locator('.cw-input').evaluate(el=>el===window.__crosswordInput&&el===document.activeElement));
      if(index===49&&width===390)await p.screenshot({path:`${out}/expanded-keyboard-layout-${lang}.png`,animations:'disabled'});
      await p.getByRole('button',{name:T.hideKeyboard,exact:true}).click();
      assert(await p.locator('.cw-input').evaluate(el=>el!==document.activeElement));
      await p.evaluate(()=>window.__setKeyboardInset(0));await p.waitForTimeout(50);
      // A real input event, then autosave/reload: input focus isn't a custom keyboard.
      await p.getByRole('button',{name:T.nextClue,exact:true}).click();
      const active=await p.locator('.cw-cell.is-active').getAttribute('data-cell');
      const cell=built.cells.find(c=>boardKey(c.row,c.col)===active);
      await p.locator('.cw-input').fill(cell.solution);
      const stored=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
      assert.equal(stored[puzzle.id].values[active],cell.solution);assert.equal(stored[old.puzzle.id].values[oldKey],oldCell.solution);
      await audit(p,`${lang} ${width} ${theme} ${puzzle.entries.length} words`);
      await p.reload();await p.locator('.cw-shell[data-lang-ready]').waitFor();await open(p,puzzle.id);
      assert.equal(await p.locator(`[data-cell="${active}"] .cw-cell-letter`).innerText(),cell.solution);
      if(index===49){
        await p.locator('.cw-cell.is-active').click();
        const activeBefore=await p.locator('.cw-cell.is-active').getAttribute('data-cell');
        await p.locator('.cw-grid-viewport').evaluate(v=>{v.scrollLeft=30;v.scrollTop=50;});
        const r=await p.locator('.cw-grid-viewport').boundingBox();
        const x=r.x+r.width/2,y=r.y+r.height/2;
        if(width<700){
          const cdp=await context.newCDPSession(p);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
          for(let d=10;d<=45;d+=5)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-d}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
        }else{
          await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x,y-45,{steps:8});await p.mouse.up();
        }
        await p.waitForTimeout(100);
        assert(await p.locator('.cw-grid-viewport').evaluate(v=>v.scrollTop)>60,'real swipe/drag did not pan');
        assert.equal(await p.locator('.cw-cell.is-active').getAttribute('data-cell'),activeBefore,'drag accidentally selected a cell');
        assert(await p.locator('.cw-input').evaluate(el=>el===document.activeElement),'panning lost native input focus');
      }
      // Manual pan is not undone by timer-only rerenders.
      await p.locator('.cw-grid-viewport').evaluate(v=>{v.scrollLeft=0;v.scrollTop=0;});await p.waitForTimeout(1050);
      const pos=await p.locator('.cw-grid-viewport').evaluate(v=>[v.scrollLeft,v.scrollTop]);assert.deepEqual(pos,[0,0]);
      await back(p,T);
    }
    checks.push({lang,width,height,theme,result:'passed'});console.log('PASS',lang,width,height,theme);
    await context.close();
  }
  // Completing a 50-word grid from a nearly-complete save exercises every-cell
  // restoration, durable hints, completion, replay and progression in both languages.
  for(const lang of ['en','ru']){
    const puzzle=catalog[lang].at(-1),built=buildPuzzle(puzzle),T=stringsFor(lang);
    const values=Object.fromEntries(built.cells.filter(c=>!c.isBlack).map(c=>[boardKey(c.row,c.col),c.solution]));
    const cell=built.cells.find(c=>!c.isBlack),key=boardKey(cell.row,cell.col);delete values[key];
    const context=await browser.newContext({viewport:{width:390,height:780},serviceWorkers:'block'});
    await context.addInitScript(({lang,id,values,store})=>{localStorage.setItem('lab:lang',lang);localStorage.setItem(store,JSON.stringify({[id]:{values,revealed:[],assistanceCount:2,elapsed:120,completed:false}}));},{lang,id:puzzle.id,values,store:storageKey});
    const p=await context.newPage();p.on('pageerror',e=>errors.push(String(e)));await p.goto(origin);await p.locator('.cw-shell[data-lang-ready]').waitFor();await open(p,puzzle.id);
    await p.locator(`[data-cell="${key}"]`).click();await p.locator('.cw-input').fill(cell.solution);
    await p.locator('.cw-complete').waitFor();assert.equal(await p.locator('.cw-complete-stats strong').nth(1).innerText(),'2');
    const stored=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);assert.equal(stored[puzzle.id].completed,true);assert.equal(Object.keys(stored[puzzle.id].values).length,built.cells.filter(c=>!c.isBlack).length);
    await p.getByRole('button',{name:T.playAgain,exact:true}).click();assert.equal(await p.locator('.cw-cell-letter').allTextContents().then(a=>a.join('')),'');
    checks.push({lang,completion50:true,result:'passed'});console.log('PASS completion50',lang);await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/expanded-browser-check.json`,JSON.stringify({checks,errors},null,2));
}finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
