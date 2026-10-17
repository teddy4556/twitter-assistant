// v0.3.45 选择器验证 —— 用**用户实测的真实 DOM** 跑,不是自造结构
//
// [为什么必须用真实 DOM] v0.3.41~v0.3.44 四版的 CSS 全写在 `.tms-down > button` 上,
//   而 X 改版后真实结构是 button 在第 3 层 → 四版全部静默失效。
//   自造结构测 100 次也不会发现 —— 造出来的就是自己假设的那个结构。
//   用户实测的 outerHTML:
//     div.css-g5y9jx.tms-down
//       div.css-g5y9jx.r-18u37iz
//         button.css-g5y9jx.r-1777fci
//           div.css-146c3p1.r-bcqeeo
//             div.css-g5y9jx.r-xoduu5
//       span.tms-badge
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const V = '/opt/data/skills/userscript/twitter/versions/twitter-assistant-v0.3.45.user.js';
const full = readFileSync(V, 'utf8');
const css = full.slice(full.indexOf('const CSS = `') + 15,
                       full.indexOf("`.replace(/\\s+/g, ' ').trim();"))
                 .replace(/\$\{[^}]+\}/g, 'X');

const REAL = `
<div class="css-g5y9jx tms-down">
  <div class="css-g5y9jx r-18u37iz">
    <button class="css-g5y9jx r-1777fci">
      <div class="css-146c3p1 r-bcqeeo">
        <div class="css-g5y9jx r-xoduu5">
          <svg viewBox="0 0 24 24">
            <g class="tms-d"><path stroke="currentColor" d="M3,14"/></g>
            <g class="tms-c"><path stroke="currentColor" d="M3,20"/></g>
            <g class="tms-l"><circle stroke="currentColor" cx="12" cy="12" r="10"/></g>
            <g class="tms-f"><circle stroke="currentColor" cx="12" cy="12" r="11"/></g>
          </svg>
        </div>
      </div>
    </button>
  </div>
  <span class="tms-badge">1/3</span>
</div>`;

const dom = new JSDOM(`<!DOCTYPE html><body>${REAL}</body>`);
const d = dom.window.document;
const W = dom.window;
const style = d.createElement('style');
style.textContent = css;
d.head.appendChild(style);

let pass = 0, fail = 0;
const ok = (c, n, x = '') => { if (c) pass++; else { fail++; console.log(`  ❌ ${n}${x ? '  →  ' + x : ''}`); } };

console.log('=== ① 反证:旧写法(v0.3.41~v0.3.44)确实匹配不到 ===');
ok(d.querySelector('.tms-down > button') === null, '`.tms-down > button` 匹配不到 —— 这就是四版失效的真因');
ok(d.querySelector('.tms-down.tms-d > svg > g.tms-d') === null, '`.tms-down.tms-d > svg > g.tms-d` 也匹配不到');

console.log('\n=== ② 新写法(v0.3.45)命中 ===');
const wrap = d.querySelector('.tms-down');
const btn = d.querySelector('.tms-down button');
ok(btn !== null, '`.tms-down button` 命中 button');
ok(btn && btn.tagName === 'BUTTON', '命中的是 BUTTON', btn && btn.tagName);
ok(d.querySelector('.tms-down > div') !== null, '`.tms-down > div` 命中中间层');
ok(d.querySelector('.tms-down svg') !== null, '`.tms-down svg` 命中 svg');
ok(d.querySelector('.tms-down .tms-badge') !== null, '`.tms-down .tms-badge` 命中徽标');
for (const st of ['d', 'c', 'l', 'f']) {
  wrap.className = `css-g5y9jx tms-down tms-${st}`;
  ok(d.querySelector(`.tms-down.tms-${st} svg > g.tms-${st}`) !== null, `状态图标 .tms-${st} 能选中`);
  ok(d.querySelector(`.tms-down.tms-${st} button`) === btn, `底色选择器 .tms-down.tms-${st} button 命中`);
}
wrap.className = 'css-g5y9jx tms-down tms-d';

console.log('\n=== ③ 计算样式(核心 5 项)===');
const cs = W.getComputedStyle(btn);
ok(cs.backgroundColor === 'rgb(0, 208, 132)', '底色 = 亮绿 #00d084', cs.backgroundColor);
ok(cs.color === 'rgb(4, 18, 29)', '图标色 = 深色 #04121d', cs.color);
// ⚠️ jsdom **不解析 box-shadow 的颜色格式** —— getComputedStyle 返回的就是原文串,
//    不会转成 rgb()。所以只能断言"含那个色值",不能断言 rgb(...) 形式(实测踩过)。
ok(cs.boxShadow.includes('#04121d'), '深色描边生效', cs.boxShadow.slice(0, 46));
ok(/^0 0 0 2px #04121d/.test(cs.boxShadow.trim()), '描边是 2px 实心深色(不是白)');
ok(cs.width === '34px' && cs.height === '34px', '尺寸 34×34', `${cs.width}×${cs.height}`);
ok(cs.borderRadius === '50%', '圆形', cs.borderRadius);

console.log('\n=== ④ 四态底色(同一 button 换 class)===');
const want = { c: 'rgb(0, 158, 102)', l: 'rgb(0, 227, 154)', f: 'rgb(212, 33, 47)' };
for (const [st, w] of Object.entries(want)) {
  wrap.className = `css-g5y9jx tms-down tms-${st}`;
  const got = W.getComputedStyle(d.querySelector('.tms-down button')).backgroundColor;
  ok(got === w, `${st} 底色 = ${w}`, got);
}
wrap.className = 'css-g5y9jx tms-down tms-d';

console.log('\n=== ⑤ 中间层被压平(否则绿底会偏大/偏位)===');
const mid = W.getComputedStyle(d.querySelector('.tms-down > div'));
ok(mid.padding === '0px' || mid.padding === '', '中间层 padding 归零', mid.padding);
ok(mid.backgroundColor === 'rgba(0, 0, 0, 0)', '中间层背景透明', mid.backgroundColor);
ok(mid.borderRadius === '50%', '中间层圆形', mid.borderRadius);

console.log('\n=== ⑥ 失败态图标是白字(不被 ④ 那条拽回深色)===');
wrap.className = 'css-g5y9jx tms-down tms-f';
ok(W.getComputedStyle(d.querySelector('.tms-down button')).color === 'rgb(255, 255, 255)', '失败态 button color = 白', W.getComputedStyle(d.querySelector('.tms-down button')).color);
wrap.className = 'css-g5y9jx tms-down tms-d';

console.log(`\n${'═'.repeat(46)}`);
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
