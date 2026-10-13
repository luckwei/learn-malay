"""Functional browser checks. Run against the local static server on port 8001.

Requires the Python Playwright package and Chromium. All progress is isolated in
test browser contexts; no accounts or external data are changed.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL=os.environ.get('RANGKAI_TEST_URL','http://127.0.0.1:8001/')
ROOT=Path(__file__).resolve().parents[1]

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.environ.get('RANGKAI_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL,wait_until='networkidle')
    expect(page.locator('.sentence')).to_have_text('Saya makan nasi.')
    page.locator('#focus-select').select_option('ms:makan')
    page.locator('#guess').fill('<script>bad()</script> I eat rice')
    page.locator('#reveal-sentence').click()
    expect(page.locator('.translation')).to_have_text('I eat rice.')
    expect(page.locator('.reveal')).to_contain_text('<script>bad()</script>')
    expect(page.locator('#focus-select')).to_be_disabled()
    page.locator('[data-rating="3"]').click()
    state=page.evaluate("JSON.parse(localStorage.getItem('rangkai-v2'))")
    assert list(state['records'])==['word|ms:makan|recognition']
    assert state['exposures']['ms:saya']==1

    # Exact order is checked for the supplied tiles, including a negative path.
    page.locator('[data-mode="assemble"]').click()
    page.locator('#focus-select').select_option('ms:air')
    for word in ['air','minum','Saya']:
        page.locator('[data-tile]').filter(has_text=word).click()
    page.locator('#check-assembly').click()
    expect(page.locator('.feedback')).to_contain_text('Not the order')
    page.locator('#clear-tiles').click()
    for word in ['Saya','minum','air']:
        page.locator('[data-tile]').filter(has_text=word).click()
    page.locator('#check-assembly').click()
    expect(page.locator('.translation')).to_have_text('Saya minum air.')
    page.locator('[data-rating="3"]').click()
    state=page.evaluate("JSON.parse(localStorage.getItem('rangkai-v2'))")
    assert 'word|ms:air|recall' in state['records']
    assert 'word|ms:air|recognition' not in state['records']
    assert not any(key.startswith('grammar|') for key in state['records'])

    # Pure vocabulary uses the same schedule and the source frequency order.
    page.locator('[data-page="vocab"]').click()
    expect(page.locator('.vocab-prompt')).to_have_text('saya')
    page.locator('#reveal-vocab').click()
    expect(page.locator('.vocab-back')).to_contain_text('I / me')
    page.locator('[data-rating="3"]').click()
    expect(page.locator('.vocab-prompt')).to_have_text('I / me')
    page.locator('#reveal-vocab').click()
    page.locator('[data-rating="3"]').click()
    saved=page.evaluate("JSON.parse(localStorage.getItem('rangkai-v2'))")
    assert saved['reviews']==4
    assert saved['records']['word|ms:saya|recognition']['card']['due']>saved['records']['word|ms:saya|recognition']['card']['last_review']
    page.reload(wait_until='networkidle')
    assert page.evaluate("JSON.parse(localStorage.getItem('rangkai-v2')).reviews")==4

    # Search, meanings, records, and source disclosure.
    page.locator('[data-page="blocks"]').click()
    expect(page.locator('.catalogue-card')).to_have_count(30)
    page.locator('#word-search').fill('membaca')
    page.locator('.catalogue-card').filter(has_text='membaca').click()
    expect(page.locator('dialog')).to_contain_text('not tense or ongoing action')
    expect(page.locator('.record-grid')).to_contain_text('Not practised')
    page.keyboard.press('Escape')
    page.locator('#sources-button').click()
    expect(page.locator('dialog')).to_contain_text('1,000 supported lexical entries')
    page.locator('#close-dialog').click()

    # A future long pattern can be previewed without falsely earning review credit.
    page.locator('[data-page="path"]').click()
    page.locator('[data-pattern="reason"]').click()
    expect(page.locator('dialog')).to_contain_text('dan nampak makanan')
    expect(page.locator('dialog')).to_contain_text('Preview only')
    page.locator('#close-dialog').click()

    # Compressed text save, download, damaged-code rejection, explicit restore.
    page.locator('[data-page="progress"]').click()
    page.locator('#new-limit').select_option('10')
    page.locator('#generate-save').click()
    expect(page.locator('#save-output')).not_to_have_value('')
    code=page.locator('#save-output').input_value()
    assert code.startswith('RG2G.')
    with page.expect_download() as download:
        page.locator('#download-save').click()
    file=download.value.path()
    assert Path(file).read_text().strip().startswith('RG2G.')
    snapshot=page.evaluate("JSON.parse(localStorage.getItem('rangkai-v2'))")
    page.locator('#import-code').fill('broken save')
    page.locator('#preview-import').click()
    expect(page.locator('#import-status')).to_contain_text('Nothing was changed')
    assert page.evaluate("JSON.parse(localStorage.getItem('rangkai-v2'))")==snapshot

    newcontext=browser.new_context(viewport={'width':390,'height':844})
    device=newcontext.new_page()
    device.goto(URL+'#progress',wait_until='networkidle')
    device.locator('#import-code').fill(code)
    device.locator('#preview-import').click()
    expect(device.locator('#import-status')).to_contain_text('Save is valid')
    assert device.evaluate("localStorage.getItem('rangkai-v2')") is None
    device.locator('#confirm-import').click()
    expect(device.locator('#toast')).to_contain_text('Progress restored')
    restored=device.evaluate("JSON.parse(localStorage.getItem('rangkai-v2'))")
    assert restored['records']==snapshot['records']
    assert restored['settings']['newPerDay']==10 and restored['reviews']==4
    assert restored['history']==snapshot['history']
    device.reload(wait_until='networkidle')
    assert device.evaluate("JSON.parse(localStorage.getItem('rangkai-v2')).reviews")==4
    # File upload has the same validation/preview path; cancellation is non-destructive.
    device.locator('#import-file').set_input_files(file)
    expect(device.locator('#confirm-import')).to_be_visible()
    device.locator('#cancel-import').click()
    expect(device.locator('#import-status')).to_contain_text('unchanged')
    device.screenshot(path='/tmp/rangkai-v2-progress-mobile.png',full_page=True)

    # Two tabs refresh from storage without continuously writing back to each other.
    tab=context.new_page();tab.goto(URL+'#vocab',wait_until='networkidle')
    page.locator('[data-page="vocab"]').click()
    page.locator('#reveal-vocab').click();page.locator('[data-rating="3"]').click()
    expect(tab.locator('#toast')).to_contain_text('another tab')
    count=page.evaluate("JSON.parse(localStorage.getItem('rangkai-v2')).reviews")
    tab.wait_for_timeout(400)
    assert tab.evaluate("JSON.parse(localStorage.getItem('rangkai-v2')).reviews")==count
    a=tab.evaluate("localStorage.getItem('rangkai-v2')")
    tab.wait_for_timeout(400)
    assert tab.evaluate("localStorage.getItem('rangkai-v2')")==a

    # Legacy state migration preserves access and keeps new word records honest.
    legacycontext=browser.new_context()
    legacycontext.add_init_script("if(!localStorage.getItem('rangkai-v2'))localStorage.setItem('rangkai-v1',JSON.stringify({stage:3,confident:['0-0','1-1'],review:['2-1']}));")
    legacy=legacycontext.new_page();legacy.goto(URL+'#progress',wait_until='networkidle')
    expect(legacy.locator('.path-intro')).to_contain_text('2 familiar sentence ratings')
    migrated=legacy.evaluate("JSON.parse(localStorage.getItem('rangkai-v2'))")
    assert migrated['records']=={} and migrated['legacy']['confident']==['0-0','1-1']
    assert 'ms:membaca' in migrated['introduced']

    # Scheduling UI can exercise a long sentence with an isolated all-prerequisites fixture.
    fullcontext=browser.new_context(viewport={'width':390,'height':844})
    fullcontext.add_init_script("""if(!localStorage.getItem('rangkai-v2')){
      window.__seed=true;
    }""")
    full=fullcontext.new_page();full.goto(URL,wait_until='networkidle')
    full.evaluate("""async()=>{
      const e=await import('./engine.js');const data=await (await fetch('./data/vocabulary.json')).json();e.configureCatalogue(data);
      const s=e.freshState();s.introduced=e.getCatalogue().map(w=>w.id);s.unlocked=e.PATTERN_IDS;s.activePattern='reason';
      localStorage.setItem('rangkai-v2',JSON.stringify(s));
    }""")
    full.reload(wait_until='networkidle')
    expect(full.locator('.sentence')).to_contain_text('dan nampak makanan')
    full.locator('#reveal-sentence').click()
    expect(full.locator('.chunk-card')).to_have_count(5)
    full.screenshot(path='/tmp/rangkai-v2-long-sentence-mobile.png',full_page=True)
    full.locator('[data-page="practice"]').click()
    full.locator('[data-mode="understand"]').focus();full.keyboard.press('ArrowRight')
    expect(full.locator('[data-mode="assemble"]')).to_have_attribute('aria-selected','true')
    # 30 page/viewport combinations, including the longest sentence and backup codes.
    for width in [320,375,650,768,1024,1440]:
        full.set_viewport_size({'width':width,'height':900})
        for section in ['practice','vocab','blocks','path','progress']:
            full.goto(URL+'#'+section,wait_until='networkidle')
            assert not full.evaluate('document.documentElement.scrollWidth>innerWidth'), f'overflow {width} {section}'
    assert not errors,errors
    print('PASS: isolated word scoring, both directions, wrong/correct tile order, vocabulary FSRS ratings, reload persistence, catalogue search, source notices, long-pattern previews, compressed download, damaged-save rejection, new-device restore, upload/cancel, cross-tab refresh, legacy migration, long-sentence chunks, keyboard tabs, and 30 responsive layouts.')
    browser.close()
