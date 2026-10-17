// v0.3.45 真 DOM 验证 —— 完整跑整个 userscript,看真实渲染结果
//
// 【本轮踩的三个坑,都记在这】
// ① 切 body 的偏移必须是 **+19**:'// ==/UserScript==' 长度 18 + 换行 1 = 19。
//    用 +17 会切出多余的 '=',body 变成 "=\n\n..." → SyntaxError: Unexpected token '='
//    —— **看着像脚本崩了,其实是我 harness 切歪了**,极具误导性(本轮被骗了 3 次)。
// ② jsdom 在沙箱里只装在 /opt/data/cache/scratch,本文件必须从那目录跑。
// ③ 别用 `import x from 'node:assert'` 混搭,会 ERR_MODULE_NOT_FOUND。
//
// 【为什么必须真 DOM】v0.3.41~v0.3.44 四版的 CSS 全写在 .tms-down > button 上,
// 而 X 改版后 button 在第 3 层 → 四版全部静默失效(按钮一直是灰的)。
// 自造结构测不出来 —— 造出来的就是你假设的那个结构。必须灌 X 的真实 outerHTML。
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const V = process.argv[2] || 'twitter-assistant-v0.3.45.user.js';
const code = readFileSync('/opt/data/skills/userscript/twitter/versions/' + V, 'utf8');
const body = code.slice(code.indexOf('// ==/UserScript==') + 19);   // ① 19 不是 17

// ★ 用户实测的真实 DOM 结构(v0.3.45 的修复依据)
const X_ARTICLE = `
<main role="main"><div data-testid="primaryColumn"><section role="region"><article>
  <div data-testid="tweetText">这是一条带图片的推文</div>
  <div role="group">
    <div><div><button aria-label="转帖"><svg viewBox="0 0 24 24" class="r-13awgt0"></svg></button></div>
    <div><div><button aria-label="评论"><svg viewBox="0 0 24 24" class="r-13awgt0"></svg></button></div>
    <div><div><button aria-label="喜欢"><svg viewBox="0 0 24 24" class="r-13awgt0"></svg></button></div>
    <div><div><button aria-label="分享"><svg viewBox="0 0 24 24" class="r-13awgt0"></svg></button></div>
  </div>
  <a href="/photo/1" role="link"><img src="https://pbs.twimg.com/media/TEST.jpg?format=jpg&amp;name=large"></a>
</article></section></div></main>`;

const dom = new JSDOM(`<!DOCTYPE html><html><body>${X_ARTICLE}</body></html>`,
  { url: 'https://x.com/home', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.Element.prototype.setPointerCapture = function () {};
w.Element.prototype.releasePointerCapture = function () {};
w.Element.prototype.hasPointerCapture = function () { return false; };
const store = {};
Object.assign(w, {
  GM_getValue: (k, dv) => (k in store ? store[k] : dv),
  GM_setValue: (k, v) => { store[k] = v; },
  GM_registerMenuCommand: () => {},
  GM_download: () => {},
});
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.TextEncoder = TextEncoder;
w.eval(body);

await new Promise((r) => setTimeout(r, 1800));

let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) pass++; else { fail++; console.log(`  ❌ ${n}${x ? '  →  ' + x : ''}`); } };
const NEW = V.includes('0.3.45');
console.log(`\n=== ${V} 完整跑 userscript 后的真实渲染 ===`);

ok(d.getElementById('tms-fab') !== null, '⚙️ 齿轮按钮已创建');
ok(d.getElementById('tm-timeline-inner-lock') !== null, '加宽 CSS 已写入');
ok(d.getElementById('tms-ui-style') !== null, 'UI 样式标签已注入');

const btns = d.querySelectorAll('.tms-down');
ok(btns.length > 0, `下载按钮已注入(${btns.length} 个)`);

if (btns.length) {
  const b = btns[0].querySelector('button');
  ok(b !== null, 'wrapper 里有 button(后代选择器能取到)');
  if (b) {
    const cs = w.getComputedStyle(b);
    if (NEW) {
      ok(cs.backgroundColor === 'rgb(0, 208, 132)', '底色 = 亮绿 rgb(0,208,132)', cs.backgroundColor);
      ok(cs.color === 'rgb(4, 18, 29)', '图标色 = 深色 rgb(4,18,29)', cs.color);
      ok(cs.width === '34px', '按钮 34×34', `${cs.width}×${cs.height}`);
      ok(cs.boxShadow.includes('#04121d'), '深色描边', cs.boxShadow.slice(0, 40));
    } else {
      console.log(`  ℹ️  旧版 ${V}:底色=${cs.backgroundColor}(无色,符合"四版都没生效"的预期)`);
    }
  }
}
const lock = d.getElementById('tm-timeline-inner-lock')?.textContent || '';
ok(lock.includes('width: 1200px'), '主栏宽度 CSS 真写进去了', lock.slice(0, 46).replace(/\n/g, ' '));

console.log(`\n  通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
