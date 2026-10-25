// Injected by tests/cdp.py: plays the current lesson to the end. Answers correctly except every 5th scored item.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = [];
  const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.__proto__, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  let n = 0;
  for (let step = 0; step < 400; step++) {
    await sleep(120);
    if (document.querySelector('.result')) { log.push('RESULT'); break; }
    const fb = document.querySelector('.feedback .btn');
    if (fb) { fb.click(); continue; }
    const ex = window.__gt?.ex;
    if (!ex) { log.push('no exercise'); break; }
    const wrong = ex.scored && (++n % 5 === 0);
    const btns = [...document.querySelectorAll('.player .btn')];
    const byText = (re) => btns.find((b) => re.test(b.textContent) && !b.disabled);
    if (ex.kind === 'intro' || ex.kind === 'tip' || ex.kind === 'read') { byText(/Got it|Continue/)?.click(); log.push(ex.kind); continue; }
    if (ex.kind === 'speak') { byText(/speak now/)?.click(); log.push('speak-skip'); continue; }
    if (['mcq', 'gender', 'conj', 'cloze'].includes(ex.kind)) {
      const opts = [...document.querySelectorAll('.player .choice')];
      const target = wrong ? ex.options.find((o) => !o.ok) : ex.options.find((o) => o.ok);
      const el = opts.find((b) => b.textContent.replace(/^\d/, '').trim() === target.text.trim()) || opts[0];
      el.click(); log.push(ex.kind + (wrong ? '✗' : '')); continue;
    }
    if (ex.kind === 'type') {
      const inp = document.querySelector('.player .answer-input');
      if (!inp || inp.disabled) { await sleep(300); continue; }
      setVal(inp, wrong ? 'xyz qqq' : ex.accepted[0]);
      await sleep(80);
      byText(/Check/)?.click(); log.push('type' + (wrong ? '✗' : '')); await sleep(200); continue;
    }
    if (ex.kind === 'tiles') {
      const want = wrong ? [...ex.answer].reverse() : ex.answer;
      for (const w of want) {
        const t = [...document.querySelectorAll('.player .tiles:not(.answer) .tile:not(.used)')].find((x) => x.textContent === w);
        t?.click(); await sleep(40);
      }
      byText(/Check/)?.click(); log.push('tiles' + (wrong ? '✗' : '')); continue;
    }
    if (ex.kind === 'match') {
      for (const p of ex.pairs) {
        const L = [...document.querySelectorAll('.match .col:first-child .choice')].find((b) => b.textContent === p.a);
        const R = [...document.querySelectorAll('.match .col:last-child .choice')].find((b) => b.textContent === p.b);
        L?.click(); await sleep(30); R?.click(); await sleep(120);
      }
      log.push('match'); await sleep(500); continue;
    }
    if (ex.kind === 'order') { byText(/Check/)?.click(); log.push('order'); continue; }
    log.push('UNHANDLED ' + ex.kind); break;
  }
  return log.join(' ');
})()
