// Standalone prototype browser verification. Author: CODEX, 2026-10-29.
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
const url=pathToFileURL(path.join(root,process.env.HOME_DRAFT_FILE||'index.html')).href;
const metrics=[];
try {
  for(const width of [1440,900,390]) {
    await page.setViewportSize({width,height:width===390?844:1000});
    for(const draft of ['a','b','c']) {
      await page.goto(`${url}?review=${width}-${draft}#${draft}`);
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('.app-shell').getAttribute('data-draft'),draft);
      for(const state of ['normal','full','empty','loading','error']) {
        await page.locator('#state').selectOption(state);
        const overflow=await page.evaluate(()=>({document:document.documentElement.scrollWidth-innerWidth,main:document.querySelector('main').scrollWidth-document.querySelector('main').clientWidth}));
        assert.ok(overflow.document<=1&&overflow.main<=1,`Overflow: ${width}/${draft}/${state} ${JSON.stringify(overflow)}`);
        if(state==='normal'||(state==='empty'&&width===1440)||(state==='full'&&width===1440&&draft==='b')) {
          await page.screenshot({path:path.join(root,'previews',`${draft}-${width}-${state}.png`),fullPage:true});
        }
        metrics.push({width,draft,state,overflow});
      }
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(url);
  await page.locator('[data-action="resume"]').first().click();
  assert.ok(await page.locator('dialog').isVisible());
  assert.match(await page.locator('#modal-body').innerText(),/Chat 2/i);
  await page.keyboard.press('Escape');
  await page.locator('[data-action="story"][data-id="1"]').first().click();
  assert.equal(await page.locator('.modal-options [data-action="resume"]').count(),2);
  await page.locator('.modal-options [data-action="resume"]').first().click();
  assert.match(await page.locator('#modal-body').innerText(),/Chat 1/i);
  await page.keyboard.press('Escape');
  await page.locator('#search').fill('no-such-story');
  assert.ok(await page.getByText('No stories found.').isVisible());
  await page.getByRole('button',{name:'Clear search'}).click();
  await page.locator('#search').fill('Cartographer');
  assert.match(await page.locator('main h2').first().innerText(),/Cartographer/);
  await page.locator('#search').fill('');
  await page.locator('[data-draft="b"]').first().click();
  await page.locator('[data-filter="new"]').click();
  assert.equal(await page.locator('.book').count(),1);
  await page.locator('#state').selectOption('full');
  await page.locator('[data-filter="all"]').click();
  assert.equal(await page.locator('.book').count(),12);
  await page.locator('#state').selectOption('error');
  await page.getByRole('button',{name:'Try again'}).click();
  assert.equal(await page.locator('#state').inputValue(),'normal');
  for(const action of ['create','chat-new','import','settings','grid','lock']) {
    await page.locator(`[data-action="${action}"]`).first().click();
    assert.ok(await page.locator('dialog').isVisible(),action);
    assert.ok(await page.locator('#modal-title').innerText(),action);
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-action="menu"]').click();
  assert.equal(await page.locator('[data-action="menu"]').getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-action="menu"]').getAttribute('aria-expanded'),'false');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.book-cover')).transitionDuration),'0s');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',viewports:3,layouts:3,states:5,combinations:metrics.length,overflow:'none',consoleErrors:errors.length,interactions:'resume, Story/chat selection, search, filters, retry, create/import/navigation dialogs, mobile sidebar, reduced motion'},null,2));
} finally {await browser.close();}
