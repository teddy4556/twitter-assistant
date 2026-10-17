// ==UserScript==
// @name               Twitter 助手
// @name:zh            Twitter 助手
// @name:en            Twitter Assistant
// @description         油猴脚本,一键下载 Twitter/X 推文里的原图和原视频。下载按钮亮绿实心(深色图标 + 深色描边)+ 左下角 ⚙️ 面板:命名模板(8 占位符 chip 点一下就插入)+ 三栏宽度滑块(拖动即时生效)+ 下载进度徽标与 toast。
// @description:zh      一键下载 X 推文里的原图和原视频(下载按钮亮绿 #00d084)。左下角 ⚙️ 面板里改文件名模板(`{user-name}` `{user-id}` `{status-id}` `{date-time[:格式]}` `{date-time-local[:格式]}` `{full-text}` `{file-type}` `{file-name}`,点 chip 直接插入)+ 三栏宽度(拖动即时生效)。
// @description:en      One-click download of original images and videos from X tweets. Bottom-left gear panel: filename template with click-to-insert placeholder chips + live 3-column width sliders + download progress badge/toast.
// @author              益新 <teddy4556@users.noreply.github.com>
// @namespace           https://github.com/teddy4556/twitter-assistant
// @homepageURL         https://github.com/teddy4556/twitter-assistant
// @supportURL          https://github.com/teddy4556/twitter-assistant/issues
// @license             MIT
// @icon                https://raw.githubusercontent.com/teddy4556/twitter-assistant/main/icons/icon.svg
// @compatible           chrome
// @compatible           firefox
// @compatible           edge
// @grant                GM_download
// @grant                GM_registerMenuCommand
// @grant                GM_setValue
// @grant                GM_getValue
// [v0.3.39 删除 @grant GM_deleteValue] —— 授了但全脚本零调用,且没有配套的
//   "重置加宽"功能(唯一的重置是命名模板,用 GM_setValue(TPL_DEFAULT) 覆盖写,
//   不需要 delete)。少一条 @grant 少一分不必要的权限面。
// @match                https://x.com/*
// @match                https://twitter.com/*
// [v0.3.42] @run-at 从 document-start 改回默认 document-end。
//   真因:document-start 时 document.head 还是 null,第 744 行
//   `document.head.appendChild(style)` 直接 TypeError → 整个 IIFE 中断 →
//   后面 800 多行一行都不跑(observer 不挂 / 加宽 CSS 不写 / 面板不出现 /
//   ⚙️ 悬浮按钮不创建)。沙箱时序仿真实测确认 2 处 throw。
//   这条与 fact #520 + SKILL §1.10 铁律 #6 完全一致:「不要用 document-start」。
//   document-end 下 document.head / document.body 都已存在,时序问题从根上消失。
// @run-at              document-end
// @version             0.3.47
// @created             2026-10-13
// @updated             2026-10-17
// ==/UserScript==

/* global GM_download, GM_registerMenuCommand, GM_setValue, GM_getValue */
/* jshint esversion: 11 */

(() => {
  'use strict';

  // [v0.3.43 上提] headRoot 从段 21 提到 IIFE 第一行。
  //   原位置(段 21)在第 827 行,而 Toast(段 13.5,第 506 行)和 TUI(段 G2,第 1187 行)
  //   都要用它 —— 虽然它们只在用户交互时求值、实测不会 TDZ,但依赖"调用时机恰好晚于初始化"
  //   是隐式契约:以后谁在 IIFE 顶部加一行初始化调用就会炸,而且报错位置离真凶十万八千里。
  //   提到顶部 = 声明在任何使用点之前,契约变成结构保证,不再靠时机。
  const headRoot = () => document.head || document.documentElement;

  // ===== 1. 命名模板默认值(对齐参考 goemon2017 87KB line 274) =====
  // 8 占位符(对齐参考 line 854-860):
  //   {user-name} {user-id} {status-id}
  //   {date-time[:格式]}       UTC,默认 YYYYMMDD-hhmmss(支持自定义格式)
  //   {date-time-local[:格式]} 本地时区(支持自定义格式)
  //   {full-text} {file-type} {file-name}
  // 多图/多视频:模板不含 {file-name} 时自动加 -N 后缀
  // 模板不含 .ext 时强制加 .ext
  // 渲染逻辑对齐参考 line 601:out.replace(/\.?{file-ext}/, '') + (index>0 && !{file-name} ? -N : '') + .{file-ext}
  const TPL_DEFAULT = '{user-name}(@{user-id})_{date-time}_{status-id}_{file-type}';
  const TPL_KEY = 'tms_filename';

  // ===== 2. GraphQL 常量 =====
  // [v0.3.42] 版本标签单一真源 —— 以前 10 处 console 全写死版本号,
  //   bump 版本时漏改就会打出旧版本号却装的是新版,排查时极易被晃到。
  const TMS_VER = '0.3.47';
  const API_HOST = location.hostname;
  const TWEET_RESULT_QUERY_ID = '2ICDjqPd81tulZcYrtpTuQ';
  const AUTHORIZATION_BEARER =
    'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

  // ===== 3. 风控节流 =====
  const RATE_MIN_MS = 300;
  const API_RATE_MIN_MS = 800;
  let _lastApiAt = 0;
  let _lastDownloadAt = 0;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const throttle = async (ms) => {
    const now = Date.now();
    const wait = Math.max(0, ms - (now - _lastApiAt));
    if (wait) await sleep(wait);
    _lastApiAt = Date.now();
  };
  const throttleDownload = async () => {
    const now = Date.now();
    const wait = Math.max(0, RATE_MIN_MS - (now - _lastDownloadAt));
    if (wait) await sleep(wait);
    _lastDownloadAt = Date.now();
  };

  // ===== 4. 文件名清洗 =====
  // [v0.3.39 根因修法] 按 **code point** 拆,不是按 UTF-16 code unit。
  //   真因:旧写法 `String(s).split('')` 按 code unit 切,emoji(占 2 个 unit)
  //         会被拆成两个孤立代理项,`INVALID_CHARS['🔞']` 永远匹配不到 →
  //         实测 clean('a🔞b') === 'a🔞b',过滤 100% 失效。
  //   修法:`[...s]`(或 for...of)按 code point 迭代,emoji 作为整体查表。
  //   实测:旧 ❌ 还在 / 新 ✅ 已删;性能 1000 次 4.5ms → 3.4ms(反而更快)。
  const INVALID_CHARS = {
    '\\': '＼', '/': '／', '|': '｜', '<': '＜', '>': '＞',
    ':': '：', '*': '＊', '?': '？', '"': '＂',
    '\u200b': '', '\u200c': '', '\u2060': '', '\ufeff': '',
    // ⚠️ 刻意**不删** \u200d(ZWJ):它是 emoji 组合的粘合剂,
    //    删了 👨‍👩‍👧‍👦 会散成 👨👩👧👦、👩‍💻 会散成 👩💻。
    //    U+200D 是合法 Unicode 码点,NTFS/ext4/APFS 与浏览器下载名都接受,
    //    留在文件名里只是"看不见",不构成风险 —— 保 emoji 完整更重要。
    '🔞': '',
  };
  const clean = (s) => [...String(s ?? '')].map((c) => INVALID_CHARS[c] ?? c).join('').trim();

  // ===== 5. 日期格式化(YYYYMMDD-hhmmss,可改) =====
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const formatDate = (twitterDate, pattern = 'YYYYMMDD-hhmmss', localTz = false) => {
    if (!twitterDate) return '00000000-000000';
    const d = new Date(twitterDate);
    if (isNaN(d.getTime())) return '00000000-000000';
    if (localTz) d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const v = {
      YYYY: String(d.getUTCFullYear()).padStart(4, '0'),
      YY: String(d.getUTCFullYear()).slice(-2).padStart(2, '0'),
      MM: String(d.getUTCMonth() + 1).padStart(2, '0'),
      MMM: MONTHS[d.getUTCMonth()],
      DD: String(d.getUTCDate()).padStart(2, '0'),
      hh: String(d.getUTCHours()).padStart(2, '0'),
      mm: String(d.getUTCMinutes()).padStart(2, '0'),
      ss: String(d.getUTCSeconds()).padStart(2, '0'),
      h2: String(d.getUTCHours() % 12).padStart(2, '0'),
      ap: d.getUTCHours() < 12 ? 'AM' : 'PM',
    };
    return pattern.replace(/(YYYY|YY|MMM|MM|DD|hh|mm|ss|h2|ap)/g, (m) => v[m]);
  };

  // ===== 6. 模板读取/保存(对齐 IG Saver line 1782 思路) =====
  const getTemplate = () => GM_getValue(TPL_KEY, TPL_DEFAULT) || TPL_DEFAULT;
  const setTemplate = (tpl) => GM_setValue(TPL_KEY, tpl);

  // ===== 6.5 (v0.3.0 新增) 面板宽度读取(参考 Clean-up v9.4 §1+§5 简化) =====
  // v0.3.2:新增右栏宽度 + 左/右栏隐藏开关(3 栏全可调,任意一栏可隐藏)
  const WIDTH_KEYS = {
    timeline: 'tms_timeline_width',
    leftbar: 'tms_leftbar_width',
    rightbar: 'tms_rightbar_width',     // v0.3.2 新增
    hideLeftbar: 'tms_hide_leftbar',     // v0.3.2 新增
    hideRightbar: 'tms_hide_rightbar',   // v0.3.2 新增
    fillCenter: 'tms_fill_center',
  };
  const WIDTH_LIMITS = {
    timeline: [500, 1500],   // 推文主列宽 500-1500
    leftbar:  [200, 400],    // 左侧栏 200-400
    rightbar: [200, 400],    // v0.3.2 新增:右侧栏 200-400
  };
  // [v0.3.39] WIDTH_LIMITS 原来只声明、从未被引用(死代码),
  // 导致面板 slider 写 500-1800 而常量是 500-1500 → 拖到 1800 没人拦。
  // 修法: buildWidthCss 每次插值前走 clampW 钳制,单一真源 = WIDTH_LIMITS。
  const clampW = (v, [min, max]) => {
    const n = parseInt(v, 10);
    if (isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  };
  const getTimelineWidth = () => GM_getValue(WIDTH_KEYS.timeline, 1200);  // [v0.3.37] 默认 700→1200 跟 v9.4 一致
  const getLeftbarWidth = () => GM_getValue(WIDTH_KEYS.leftbar, 275);
  const getRightbarWidth = () => GM_getValue(WIDTH_KEYS.rightbar, 350);  // [v0.3.37] 默认 290→350
  const getHideLeftbar = () => GM_getValue(WIDTH_KEYS.hideLeftbar, false);     // v0.3.2 新增
  const getHideRightbar = () => GM_getValue(WIDTH_KEYS.hideRightbar, false);   // v0.3.2 新增
  const getFillCenter = () => GM_getValue(WIDTH_KEYS.fillCenter, false);

  // [v0.3.39 删除] 曾经的 `WidthStyles` 对象(带 key 缓存的 apply 复用器)已移除。
  //   删除原因:全脚本 **零调用** —— v0.3.31 抄 v9.4 架构时改用裸的
  //   `applyWidthStyles()` 直接 el.textContent = buildWidthCss(),这个对象就废了。
  //   留着会误导下次会话以为"还有 key 缓存机制",实际不生效。
  //   真正的幂等保障 = buildWidthCss 纯函数 + applyWidthStyles 直接重写 textContent。

  // 版面宽度 CSS(参考 Clean-up v9.4 §5 buildLayoutCss 完整版)
  // v0.3.6:搬全套 4 个 r-* class 控制(头像/内容/更多按钮的横向 flex 强制)
  // 真因:v0.3.5 只控 primaryColumn,内部 flex 容器 flex-grow:1 顶爆主栏边界
  // 修法:显式 width:100% + flex-grow:1 给中间内容容器(图就在这个容器)

  // ===== 7.1 文件名长度收敛 (v0.3.39 新增) =====
  // 真因(v0.3.38 及更早无任何裁剪,长中文昵称 + {full-text} 拼接后可能超文件系统上限):
  //   两套上限同时要守,Windows 和 Linux 算的不是同一个东西:
  //     NTFS  : 单文件名 255 **UTF-16 code unit**(中文/日文 1 字 = 1 unit)
  //     ext4  : 单文件名 255 **字节**(中文 1 字 = 3 字节)
  //   → 只要有一个超,GM_download 就落不了盘。
  // 设计要点(全部经 node 实测,见 references/v0.3.39-filename-limit.md):
  //   1) 双预算:先按 code unit 粗截,再按字节二次收敛到 255
  //   2) 扩展名优先保留 —— 砍 stem 不砍 ext,否则下下来的文件打不开
  //   3) **不劈代理对**:emoji 占 2 个 code unit,朴素 slice(0, n) 恰好切在高代理中间
  //      就会产出孤立代理对,文件名变乱码。实测 n=1..260 共 260 个截断点,
  //      朴素 slice **260 个全乱码**,加 guard 后 **0 个**。
  const FN_MAX_CU = 255;    // NTFS code unit 上限
  const FN_MAX_BYTE = 255;  // ext4 字节上限(跨平台保守取同值)
  // [v0.3.42 删除] 曾经的 `FN_ORPHAN_RE` 正则已移除。
  //   删除原因:声明后**零引用** —— safeTruncateCu / fitFileName 用的都是
  //   手写 charCodeAt 判断(判 0xD800-0xDBFF 高代理),这个正则从来没被调用过。
  //   留着会让下个会话误以为截断逻辑依赖它,实际不依赖(§1.14「空壳开关」同款)。
  // 截 stem 到 maxCu 个 code unit,且不落在代理对中间
  const safeTruncateCu = (stem, maxCu) => {
    if (maxCu <= 0) return '';
    let t = stem.length > maxCu ? stem.slice(0, maxCu) : stem;
    // 末尾若是高代理(0xD800-0xDBFF),说明劈开了 emoji → 退 1 个 code unit
    const last = t.charCodeAt(t.length - 1);
    if (last >= 0xD800 && last <= 0xDBFF) t = t.slice(0, -1);
    return t;
  };
  // [v0.3.39] 文件名收敛。reserve = 需要在 stem 之后追加的固定后缀(如 '-quoted'),
  //   预算里必须**先给它留位**,否则截断时它会被砍成 '-q',语义直接废掉(实测过)。
  //   reserve 自身过长时也要守上限 —— while 循环里 stem 砍完了要转去砍 reserve。
  const fitFileName = (name, reserve) => {
    // 拆 stem / ext(只认结尾的 .字母数字,1-10 位)
    const m = String(name).match(/^(.*?)(\.[A-Za-z0-9]{1,10})$/);
    const stem = m ? m[1] : String(name);
    const ext = m ? m[2] : '';
    let r = reserve || '';
    const budget = Math.max(0, FN_MAX_CU - ext.length);
    r = safeTruncateCu(r, budget);                       // reserve 自身也守上限
    let t = safeTruncateCu(stem, Math.max(0, budget - r.length));
    // 字节超了再收敛:先砍 stem,砍空了转去砍 reserve,同样避开代理对
    while ((t.length || r.length) && utf8Len(t + r + ext) > FN_MAX_BYTE) {
      if (t.length) {
        t = t.slice(0, -1);
        const last = t.charCodeAt(t.length - 1);
        if (last >= 0xD800 && last <= 0xDBFF) t = t.slice(0, -1);
      } else if (r.length) {
        r = r.slice(0, -1);
        const last = r.charCodeAt(r.length - 1);
        if (last >= 0xD800 && last <= 0xDBFF) r = r.slice(0, -1);
      } else break;
    }
    return t + r + ext;
  };
  // UTF-8 字节数(Tampermonkey 里用 TextEncoder,不用 Buffer)
  function utf8Len(s) {
    try { return new TextEncoder().encode(s).length; } catch (e) { return s.length; }
  }

  // ===== 7. 模板渲染(对齐参考 line 539 + 601) =====
  // 参考核心逻辑(line 601):
  //   out = (tpl.replace(/\.?{file-ext}/, '') + (index>0 && !{file-name} ? -N : '') + '.{file-ext}').replace(/{([^{}:]+)(:[^{}]+)?}/g, ...)
  // 自定义日期格式:{date-time:DD-MMM-YY hh.mm}(参考 line 539 抽 formatDate 参数)
  const renderTemplate = (tpl, info, media) => {
    // 1) 抽 {date-time[:格式]} 和 {date-time-local[:格式]} — 自定义格式
    let tplProcessed = tpl.replace(
      /\{date-time(?:-local)?(:[^{}]+)?\}/g,
      (m, fmt) => {
        const local = m.includes('-local');
        const pattern = fmt ? fmt.slice(1) : 'YYYYMMDD-hhmmss';
        return formatDate(info.createdAt, pattern, local);
      }
    );
    // 2) 抽剩余占位符
    const dict = {
      'user-name': clean(info.userName),
      'user-id': info.userId,
      'status-id': info.statusId,
      'full-text': clean((info.fullText || '').split('\n')[0].replace(/\s*https:\/\/t\.co\/\w+/g, '').slice(0, 60)),
      'file-type': media.type,
      'file-name': media.url.split('/').pop().split('?')[0].replace(/\.[^.]+$/, ''),
    };
    let out = tplProcessed.replace(/\{([a-z-]+)\}/g, (_, k) => dict[k] ?? `{${k}}`);
    // 对齐参考 line 601:模板含 {file-name} → 不加 -N;多文件 → 加 -N;强制 .ext 结尾
    const hasExtInTpl = /\.(jpg|jpeg|png|gif|mp4|webm)$/i.test(tpl.replace(/\{[^}]+\}/g, ''));
    if (!hasExtInTpl) {
      if (info.index && !tpl.includes('{file-name}')) {
        out = `${out}-${info.index}.${media.ext}`;
      } else {
        out = `${out}.${media.ext}`;
      }
    } else if (info.index && !tpl.includes('{file-name}')) {
      out = out.replace(/(\.[^.]+)$/, `-${info.index}$1`);
    }
    // [v0.3.39] 返回前收敛长度:双预算(255 code unit + 255 字节)+ 保扩展名 + 不劈 emoji。
    // 必须在 -N 后缀加完再截,否则截完再加后缀又超了。
    // info.filenameReserve:调用方(如引用推文)要在 stem 后追加的固定后缀,
    //   预算里先给它留位 —— 事后追加会被截成 '-q',语义废掉。
    return fitFileName(out, info.filenameReserve || '');
  };

  // ===== 8. Cookie 读 =====
  const getCookie = (name) => {
    const out = {};
    document.cookie.split(';').forEach((s) => {
      const i = s.indexOf('=');
      if (i > 0) out[s.slice(0, i).trim()] = s.slice(i + 1).trim();
    });
    return name ? out[name] : out;
  };

  // ===== 9. GraphQL 拉推文元数据 =====
  const fetchTweet = async (statusId) => {
    const url = `https://${API_HOST}/i/api/graphql/${TWEET_RESULT_QUERY_ID}/TweetResultByRestId`;
    const variables = {
      tweetId: statusId,
      withCommunity: true,
      includePromotedContent: false,
      withVoice: true,
    };
    const features = {
      articles_preview_enabled: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      premium_content_api_read_enabled: false,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_edit_tweet_api_enabled: false,
      responsive_web_enhance_cards_enabled: false,
      responsive_web_graphql_exclude_directive_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: false,
      responsive_web_grok_image_annotation_enabled: false,
      responsive_web_grok_share_attachment_enabled: false,
      responsive_web_grok_show_grok_translated_post: false,
      responsive_web_jetfuel_frame: false,
      responsive_web_media_download_video_enabled: false,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      rweb_video_screen_enabled: false,
      standardized_nudges_misinfo: true,
      tweet_awards_web_tipping_enabled: false,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      tweetypie_unmention_optimization_enabled: false,
      verified_phone_label_enabled: false,
      view_counts_everywhere_api_enabled: true,
    };
    const cookies = getCookie();
    const headers = {
      authorization: AUTHORIZATION_BEARER,
      'x-twitter-client-language': cookies.lang || 'en',
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-csrf-token': cookies.ct0,
    };
    if (cookies.ct0 && cookies.ct0.length === 32) headers['x-guest-token'] = cookies.gt;
    const qs = `?variables=${encodeURIComponent(JSON.stringify(variables))}` +
               `&features=${encodeURIComponent(JSON.stringify(features))}`;
    await throttle(API_RATE_MIN_MS);
    const resp = await fetch(url + qs, { headers, credentials: 'include' });
    if (!resp.ok) {
      throw new Error(`graphql ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    }
    const data = await resp.json();
    const result = data?.data?.tweetResult?.result;
    if (!result) throw new Error('tweetResult 空: ' + JSON.stringify(data).slice(0, 200));
    return result.__typename === 'TweetWithVisibilityResults' ? result.tweet : result;
  };

  // ===== 10. 解析媒体清单 =====
  const parseMedias = (legacy) => {
    const list = (legacy?.extended_entities?.media) || (legacy?.entities?.media) || [];
    return list.map((m) => {
      if (m.type === 'photo') {
        // [v0.3.38 根因修法] 保持原生 format,只把 name 提到 orig
        // 真因(v0.3.36/0.3.37 写死 format=jpg 导致 PNG 原图 100% 下载失败):
        //   X 的 pbs.twimg.com 不做服务端转码, format 参数只认"这张图的原生格式"。
        //   沙箱实测 2026-10-14:
        //     jpg 原生图 F84wAzbXYAALzBC -> format=jpg&name=orig = 200 (ffd8ffe0)
        //                                      format=png&name=orig = 404
        //     png 原生图 F9DOCS0W8AImlRC -> format=png&name=orig = 200 (89504e47)
        //                                      format=jpg&name=orig = 404  <-- 旧版全挂在这
        //   所以"强制转 jpg"这个思路本身是错的: 改 format = 改原生 = 404。
        // 修法: 从 media_url_https 里读出原生 format 原样带上, 只改 name → orig,
        //       ext 由原生 format 推导, 保证文件名跟字节 100% 一致。
        const raw = m.media_url_https || '';
        const baseUrl = raw.split('?')[0];
        const fm = raw.match(/[?&]format=(\w+)/i);
        const fmt = (fm && fm[1] ? fm[1] : 'jpg').toLowerCase();
        const ext = fmt === 'png' ? 'png' : fmt === 'webp' ? 'webp' : fmt === 'gif' ? 'gif' : 'jpg';
        const url = baseUrl ? `${baseUrl}?format=${fmt}&name=orig` : '';
        return {
          type: 'photo',
          ext,
          url,
          // [v0.3.38] 兜底 URL = X 自己给的原始 media_url_https, 必定可下(可能是缩略图但至少有图)
          raw: raw,
          width: m.original_info?.width || 0,
          height: m.original_info?.height || 0,
        };
      }
      if (m.type === 'video' || m.type === 'animated_gif') {
        const variants = (m.video_info?.variants || []).filter((v) => v && v.url);
        // [v0.3.39] 纯 HLS 视频改为「诚实提示」而不是「静默丢弃」。
        // 根因(v0.3.38 号称已修,实测未修,2026-10-16 确认):
        //   m3u8(application/x-mpegURL) 单次 GET 只返回 master playlist 清单文本,
        //   里面是一串 .ts 分片地址,不是视频字节流。所以就算把它放进下载池,
        //   GM_download 下到的也只是几十 KB 的 .m3u8 文本,双击打不开。
        //   → 旧代码 /video\//.test('application/x-mpegURL') 匹配不到(不是 video/ 前缀),
        //     .mp4 后缀也不匹配 → return null → filter(Boolean) 静默吞掉,用户只看到"少了几个文件"。
        // 修法(用户 10-16 拍板:只做提示,不引入 ffmpeg.wasm 之类外部库):
        //   只认 content_type === 'video/mp4' 且带 bitrate 的档位;
        //   拿不到就返回 {undownloadable:true, reason},由 onDownload 如实告知用户,
        //   绝不"下载成功"一个打不开的文件。
        let pool = variants.filter((v) => v.content_type === 'video/mp4' && v.bitrate);
        // 兜底:仍是 mp4 但没标 bitrate(X 偶尔这么给),URL 带 .mp4 才认
        if (!pool.length) pool = variants.filter((v) => v.content_type === 'video/mp4' && /\.mp4/i.test(v.url));
        if (!pool.length) {
          const ctList = [...new Set(variants.map((v) => v.content_type).filter(Boolean))];
          const isHls = variants.some((v) => v.content_type === 'application/x-mpegURL');
          return {
            type: m.type === 'animated_gif' ? 'gif' : 'video',
            undownloadable: true,
            // isHls → 用户能理解的原因;否则如实报"未知格式",不猜
            reason: isHls
              ? 'HLS 流(油猴无法直接下载)'
              : (ctList.length ? `无可下载的 mp4 档位(${ctList.join(' / ')})` : '无可用视频档位'),
            // [v0.3.42 删除] 曾经的 `cover: m.media_url_https` 字段已移除。
            //   删除原因:undownloadable 项的这个字段**全脚本零消费** ——
            //   onDownload 只读 m.reason,m.raw / m.url / m.ext,cover 谁也没碰过。
            //   注释写着"仅供 UI 提示用",但 UI 里从来没接。属于纯预留字段。
          };
        }
        const best = pool.reduce((a, b) => (b.bitrate || 0) > (a.bitrate || 0) ? b : a);
        return { type: m.type === 'animated_gif' ? 'gif' : 'video', ext: 'mp4', url: best.url, bitrate: best.bitrate || 0 };
      }
      return null;
    }).filter(Boolean);
  };

  // ===== 11. 下载触发 =====
  // [v0.3.38] 真降级重试: GM_download 的错误只走 onerror 回调, 不会 throw,
  // 所以 v0.3.37 那个 catch 块是死代码 —— 失败就是失败, 一次都不重试。
  // 修法: onerror 里真正兜底, 先退到 X 原始 URL (X 自己给的 media_url_https, 必定有效)。
  const downloadOne = async (btn, url, filename, fallbackUrl) => {
    await throttleDownload();
    let retried = false;
    const start = (u) => {
      GM_download({
        url: u,
        name: filename,
        onload: () => setBtn(btn, 'completed', '下载完成'),
        onerror: (err) => {
          const detail = err?.details?.current || err?.error || err?.details || '未知';
          if (!retried && fallbackUrl && fallbackUrl !== u) {
            retried = true;
            setBtn(btn, 'loading', '重试原链接…');
            start(fallbackUrl);
            return;
          }
          setBtn(btn, 'failed', '失败: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)));
        },
      });
    };
    try {
      start(url);
    } catch (e) {
      try {
        const a = document.createElement('a');
        a.href = fallbackUrl || url; a.download = filename; a.rel = 'noopener';
        document.body.appendChild(a); a.click();
        setTimeout(() => a.remove(), 200);
        setBtn(btn, 'completed', '下载完成');
      } catch (e2) {
        setBtn(btn, 'failed', '失败: ' + e2.message);
      }
    }
  };

  // ===== 12. SVG 图标(4 状态) =====
  const SVG = {
    download: '<g class="tms-d"><path d="M3,14 v5 q0,2 2,2 h14 q2,0 2,-2 v-5 M7,10 l4,4 q1,1 2,0 l4,-4 M12,3 v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></g>',
    // [v0.3.42] completed / loading 两个 SVG 原先写死 stroke="#1DA1F2",改成 currentColor。
    //   真因:属性选择器(stroke 属性)优先级高于 CSS 继承的 color,v0.3.41 的
    //   `.tms-down > button { color:#fff }` 和四状态底色**碰不到 path 里的 stroke** ——
    //   结果就是绿底配蓝勾、蓝底配蓝圈(转起来几乎看不见)。
    //   改 currentColor 后配色全部由 CSS 接管,四状态配色才真正生效。
    completed: '<g class="tms-c"><path d="M3,14 v5 q0,2 2,2 h14 q2,0 2,-2 v-5 M7,10 l3,4 q1,1 2,0 l8,-11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></g>',
    loading: '<g class="tms-l"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="4" opacity="0.4" /><path d="M12,2 a10,10 0 0 1 10,10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" /></g>',
    failed: '<g class="tms-f"><circle cx="12" cy="12" r="11" fill="#f33" stroke="currentColor" stroke-width="2" opacity="0.8" /><path d="M14,5 a1,1 0 0 0 -4,0 l0.5,9.5 a1.5,1.5 0 0 0 3,0 z M12,17 a2,2 0 0 0 0,4 a2,2 0 0 0 0,-4" fill="#fff" stroke="none" /></g>',
  };

  // ===== 13. 按钮状态切换 =====
  // v0.1.5 修法:state='download' 时不重写 innerHTML(保留 cloneNode 时已写入的 SVG.download)
  // 避免每次 reset 触发 svg 重排,导致按钮位置错位
  const setBtn = (btn, state, title) => {
    btn.classList.remove('tms-d','tms-c','tms-l','tms-f');
    btn.classList.add('tms-' + (state[0] || 'd'));
    btn.title = title || state;
    const svg = btn.querySelector('svg');
    if (svg && state !== 'download') {
      // 只在非 download 状态写 innerHTML(切到 c/l/f),download 由 cloneNode 时已设
      svg.innerHTML = SVG[state] || SVG.download;
    }
  };

  // [v0.3.42 删除] 曾经的 `makeBtn` 辅助函数已移除。
  //   删除原因:定义后**零调用** —— 工具栏走 injectBtn 的 cloneNode 路径,
  //   媒体 tab 走 injectMediaTabBtn 的手写 innerHTML 路径,两条都不经过它。
  //   这 10 行完整的自创按钮逻辑(圆底 + 事件绑定 + 无障碍属性)从来没被执行过,
  //   留着会让下个会话以为存在第三条注入路径。

  // ===== 13.5 v0.3.43 下载进度可视化(toast + 按钮徽标) =====
  // [v0.3.43] 动机:v0.3.42 的进度只写进 `btn.title`(tooltip),
  //   而文件名动辄 40-60 字 —— tooltip 要悬停 2 秒才弹出、宽度还被浏览器截断。
  //   用户点完按钮只能盯着一个转圈的圈,不知道下了几个、还剩几个、成功没有。
  //   修法两条并行,各管一件事:
  //     ① toast:底部居中浮层,带**完整文件名 + 计数**,4.2s 自动消失,新消息顶掉旧的。
  //        负责"现在在干嘛"(长文本必须有个能放得下的地方)。
  //     ② badge:按钮右上角小圆角,`2/5` 计数。负责"还剩几个"(视线不用离开按钮)。
  //   为什么 toast 不复用 TUI.buildCss 那个 style 标签:
  //   toast 内容**动态变**,配色随主题变。走主 style 标签就要跟 applyWidthStyles
  //   抢同一个节点的 textContent —— 两个独立功能互相覆写,是最难查的一类 bug。
  //   → toast 自建一个空 div(id=tms-toast),配色写在 TUI.buildCss 里(跟随主题),
  //     JS 只改 textContent + class,永不碰 style。
  const Toast = {
    el: null,
    timer: null,
    show(msg, kind = 'info') {
      if (!document.body) return;
      if (!this.el) {
        this.el = document.createElement('div');
        this.el.id = 'tms-toast';
        headRoot().appendChild(this.el);
      }
      // 先重置动画类,让连续两条 toast 也能触发入场(去掉再读回)
      this.el.className = 'tms-toast';
      void this.el.offsetWidth;
      this.el.className = 'tms-toast on ' + kind;
      this.el.textContent = msg;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.el) this.el.classList.remove('on');
      }, 4200);
    },
    hide() {
      clearTimeout(this.timer);
      if (this.el) { this.el.classList.remove('on'); this.el.textContent = ''; }
    },
  };
  // [v0.3.43] 按钮徽标。懒创建 —— 平时 DOM 里没有这个节点,只有真正开始下载
  //   且有计数时才插入。理由:给上千个推文卡都塞一个空 span 是纯浪费。
  const setBadge = (btn, text) => {
    if (!btn) return;
    let b = btn.querySelector(':scope > .tms-badge');
    if (!text) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('span');
      b.className = 'tms-badge';
      btn.appendChild(b);
    }
    b.textContent = text;
  };
  // 徽标 + toast 一次说清(下载主流程每个节点都调它,避免两处各拼一半文案)
  const reportProgress = (btn, opts) => {
    const { badge, toast, kind } = opts;
    setBadge(btn, badge || '');
    if (toast) Toast.show(toast, kind || 'info');
  };

  // ===== 15. 下载主流程(每次 getTemplate 实时读) =====
  const onDownload = async (btn, statusId, kind = 'main') => {
    if (btn.classList.contains('tms-l')) return;
    setBtn(btn, 'loading', '正在拉取元数据…');
    reportProgress(btn, { badge: '…', toast: '正在拉取推文元数据…' });
    let tweet;
    try {
      tweet = await fetchTweet(statusId);
    } catch (e) {
      console.error('[tms] fetchTweet fail', e);
      setBtn(btn, 'failed', '拉取失败: ' + e.message);
      reportProgress(btn, { badge: '', toast: '拉取失败:' + e.message, kind: 'err' });
      return;
    }
    const legacy = tweet?.legacy || {};
    const user = tweet?.core?.user_results?.result?.legacy || {};
    const medias = parseMedias(legacy);
    if (!medias.length) {
      setBtn(btn, 'failed', '这条推文没有媒体');
      reportProgress(btn, { badge: '', toast: '这条推文没有媒体', kind: 'warn' });
      return;
    }
    const tpl = getTemplate();  // 实时读,改菜单立刻生效
    const info = {
      userName: user.name || '',
      userId: user.screen_name || '',
      statusId: legacy.id_str || statusId,
      createdAt: legacy.created_at || '',
      fullText: legacy.full_text || '',
    };
    // [v0.3.39] 把「可下载」和「不可下载」分开统计。
    // undownloadable 项(纯 HLS / 无 mp4 档位)不喂给 downloadOne ——
    // 否则会拿 undefined 当 URL 去下,要么报无意义错误,要么下到一个打不开的 m3u8。
    const downloadable = medias.filter((m) => !m.undownloadable);
    const skipped = medias.filter((m) => m.undownloadable);
    if (!downloadable.length) {
      // 全都下不了 —— 直接把原因说清楚,不要让按钮空转
      const why = skipped.map((m) => m.reason).join(';');
      setBtn(btn, 'failed', `无法下载:${why}`);
      reportProgress(btn, { badge: '', toast: '无法下载:' + why, kind: 'err' });
      console.warn(`[tms ${TMS_VER}] 无可下载媒体:`, why);
      return;
    }
    for (let i = 0; i < downloadable.length; i++) {
      const m = downloadable[i];
      const idx = downloadable.length > 1 ? (i + 1) : 0;
      const filename = renderTemplate(tpl, { ...info, index: idx }, m);
      const tail = skipped.length ? ` (${i + 1}/${downloadable.length},${skipped.length} 项跳过)` : '';
      setBtn(btn, 'loading', `下载 ${i + 1}/${downloadable.length}${tail}: ${filename}`);
      // [v0.3.43] 进度可视:徽标给计数(tooltip 放不下),toast 给完整文件名
      reportProgress(btn, {
        badge: `${i + 1}/${downloadable.length}`,
        toast: `下载 ${i + 1}/${downloadable.length}${tail} · ${filename}`,
      });
      await downloadOne(btn, m.url, filename, m.raw);
    }
    // [v0.3.39] 有跳过项时,如实说明"下了几个 + 跳过几个 + 为什么",不让用户以为全成功
    if (skipped.length) {
      const msg = `已下载 ${downloadable.length} 项,${skipped.length} 项跳过(${skipped.map((m) => m.reason).join(';')})`;
      setBtn(btn, 'completed', msg);
      reportProgress(btn, { badge: `✓${downloadable.length}`, toast: msg, kind: 'warn' });
      console.warn(`[tms ${TMS_VER}] 部分媒体跳过:`, skipped.map((m) => m.reason).join('; '));
      return;
    }
    setBtn(btn, 'completed', `已下载 ${downloadable.length} 项媒体`);
    reportProgress(btn, { badge: `✓${downloadable.length}`, toast: `已下载 ${downloadable.length} 项媒体`, kind: 'ok' });
    // [v0.3.43 修 v0.3.39 遗留 bug] 引用推文的汇总计数,**必须在函数顶部预声明累加器**。
    //   旧写法(块外 `typeof qSkipped !== 'undefined' ? qSkipped : []`)**恒为 []**:
    //   `if (qsr) { const qSkipped = ... }` 的块是一个独立词法作用域,出块后标识符
    //   就脱离作用域;typeof 对未声明标识符有豁免(返回 'undefined' 不抛),所以不报错,
    //   但也**永远拿不到值** —— 实测两种情况(有/无引用推文)都返回 0。
    //   后果(v0.3.39~v0.3.42 一直存在):引用推文跳过的项从来没算进最终汇总,
    //   用户看到「已下载 3 项」而实际下了 3 + 2 = 5 项,少下的那部分被静默吞掉。
    //   修法:累加器提到函数顶部(同一作用域),块内只赋值。
    let quotedSkippedOut = [];
    let quotedDoneCount = 0;
    // 引用推文
    const qsr = tweet?.quoted_status_result?.result;
    if (qsr) {
      const qTweet = qsr.__typename === 'TweetWithVisibilityResults' ? qsr.tweet : qsr;
      const qLegacy = qTweet?.legacy || {};
      const qUser = qTweet?.core?.user_results?.result?.legacy || {};
      const qMedias = parseMedias(qLegacy);
      if (qMedias.length) {
        const qInfo = {
          userName: qUser.name || '',
          userId: qUser.screen_name || '',
          statusId: qLegacy.id_str || '',
          createdAt: qLegacy.created_at || '',
          fullText: qLegacy.full_text || '',
        };
        // [v0.3.39] 引用推文同样过滤 undownloadable(否则 undefined URL 进 downloadOne)
        const qDl = qMedias.filter((m) => !m.undownloadable);
        const qSkipped = qMedias.filter((m) => m.undownloadable);
        for (let i = 0; i < qDl.length; i++) {
          const m = qDl[i];
          const idx = qDl.length > 1 ? (i + 1) : 0;
          // [v0.3.39] -quoted 在截断预算里**预留位置**,不是事后追加再补救
          //   (事后追加会被 fitFileName 砍成 '-q',实测踩过)
          const filename = renderTemplate(
            tpl,
            { ...qInfo, index: idx, filenameReserve: '-quoted' },
            m
          );
          const tail = qSkipped.length ? ` (${i + 1}/${qDl.length},${qSkipped.length} 项跳过)` : '';
          setBtn(btn, 'loading', `引用 ${i + 1}/${qDl.length}${tail}: ${filename}`);
          // [v0.3.43] 引用推文也走同一条进度可视路径(徽标前缀「引」区分来源)
          reportProgress(btn, {
            badge: `引${i + 1}/${qDl.length}`,
            toast: `引用 ${i + 1}/${qDl.length}${tail} · ${filename}`,
          });
          await downloadOne(btn, m.url, filename, m.raw);
        }
        if (qSkipped.length) {
          console.warn(`[tms ${TMS_VER}] 引用推文媒体跳过:`, qSkipped.map((m) => m.reason).join('; '));
        }
        // [v0.3.43] 写入函数顶部的累加器,供收尾汇总用(见上面注释)
        quotedSkippedOut = qSkipped;
        quotedDoneCount = qDl.length;
      }
    }
    // [v0.3.43] 收尾汇总:正文 + 引用推文的跳过项一起报出。
    //   v0.3.39 那句 `typeof qSkipped !== 'undefined'` 恒为 undefined(见上面注释),
    //   导致引用推文的跳过项从未计入 —— 现在改读累加器。
    const allSkipped = skipped.concat(quotedSkippedOut).map((m) => m.reason);
    const totalDone = downloadable.length + quotedDoneCount;
    const finalMsg = allSkipped.length
      ? `已下载 ${totalDone} 项,${allSkipped.length} 项跳过(${allSkipped.join(';')})`
      : `已下载 ${totalDone} 项媒体`;
    setBtn(btn, 'completed', finalMsg);
    // [v0.3.43] 收尾:徽标定格在成功态,toast 报最终汇总(含引用推文计数)。
    //   注意这一步会覆盖掉上面的「正文下载完成」toast —— 这是有意的:
    //   用户关心的是"全部结束后的总数",不是中间某一步。
    reportProgress(btn, {
      badge: `✓${totalDone}`,
      toast: finalMsg + (quotedDoneCount ? `(含引用 ${quotedDoneCount} 项)` : ''),
      kind: allSkipped.length ? 'warn' : 'ok',
    });
  };

  // ===== 16. 工具栏(分享按钮后)插按钮 — 对齐参考 line 350-364 =====
  // v0.1.6 修法:selector 拿 .parentNode(整个 wrapper,不是 button 自身),跟参考 line 351 一致
  // 上版 v0.1.4/v0.1.5 选错 selector,cloneNode 出 button 自身,缺外层 wrapper → 上下错位
  const injectBtn = (article) => {
    if (article.dataset.tmsInjected) return;
    const mediaSel = [
      'a[href*="/photo/1"]',
      'div[role="progressbar"]',
      'button[data-testid="playButton"]',
    ].join(',');
    if (!article.querySelector(mediaSel)) return;
    const group = article.querySelector('div[role="group"]:last-of-type');
    if (!group) return;
    // 参考 line 351:.pop().parentNode 拿 wrapper,不是 button
    const lastInner = Array.from(group.querySelectorAll(':scope>div>div, :scope>div>button'))
      .filter((el) => el.querySelector('svg, button'))
      .pop();
    if (!lastInner) return;
    const lastBtn = lastInner.parentNode;  // 拿 wrapper(整个 div,继承 flex/height)
    // 1) 克隆 X 自带按钮 — 继承所有 wrapper CSS
    const btnDown = lastBtn.cloneNode(true);
    // 2) 删 disabled(参考 line 360)
    const innerBtn = btnDown.querySelector('button');
    if (innerBtn) innerBtn.removeAttribute('disabled');
    // 3) 改内部 svg → 下载图标(参考 line 363,只改 innerHTML,**不重设 width/height**)
    const innerSvg = btnDown.querySelector('svg');
    if (innerSvg) innerSvg.innerHTML = SVG.download;
    // 4) 状态标记 + click(参考 line 366-367)
    btnDown.classList.add('tms-down');
    setBtn(btnDown, 'download', '下载媒体');
    const statusId = (location.href.match(/\/status\/(\d+)/) || [])[1]
      || article.querySelector('a[href*="/status/"]')?.href.split('/status/').pop().split('/')[0];
    if (statusId) {
      btnDown.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        onDownload(btnDown, statusId);
      });
    }
    // 5) 直接插入 wrapper 层级(参考 line 364 .insertBefore(btn_down, btn_share.nextSibling))
    lastBtn.parentNode.insertBefore(btnDown, lastBtn.nextSibling);
    article.dataset.tmsInjected = 'true';
  };

  // ===== 17. media tab 兼容 =====
  const injectMediaTabBtn = (li) => {
    if (li.dataset.tmsInjected) return;
    const statusId = li.querySelector('a[href*="/status/"]')?.href.split('/status/').pop().split('/')[0];
    if (!statusId) return;
    const btn = document.createElement('div');
    btn.className = 'tms-btn tms-overlay';
    btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;">' + SVG.download + '</svg>';
    setBtn(btn, 'download', '下载媒体');
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onDownload(btn, statusId); });
    li.appendChild(btn);
    li.dataset.tmsInjected = 'true';
  };

  // ===== 18. detect 入口 =====
  const detect = (node) => {
    if (node.tagName === 'ARTICLE') injectBtn(node);
    else if (node.tagName === 'DIV' && node.querySelector('article')) {
      node.querySelectorAll('article').forEach(injectBtn);
    }
    if (node.tagName === 'LI' && node.getAttribute('role') === 'listitem') {
      injectMediaTabBtn(node);
    } else if (node.tagName === 'DIV') {
      node.querySelectorAll('li[role="listitem"]').forEach(injectMediaTabBtn);
    }
  };

  // ===== 19. CSS(精简) =====
  // v0.1.7 修法:加 3 行 wrapper 居中,消除细微上下错位(X 自带 wrapper 可能没 align-items)
  // [v0.3.40] .tms-btn 的外观(圆形/配色/hover)已移到 TUI.buildCss 的新样式里,
  //   这里只保留**状态显示逻辑**和 .tms-down 克隆 wrapper 的定位 —— 别重复定义外观,
  //   两处同时生效时旧规则会赢,改主题时就会出现"改不动"的按钮。
  const CSS = `
/* ══════════════════════════════════════════════════════════════
   [v0.3.45 结构性修复 · 用户实测截图发现] 下载按钮 X 改版后 wrapper 多了一层
   ⚠️ 2026-10-17 真因(v0.3.41~v0.3.44 共 4 版全部静默失效):
      v0.3.41 的 5 处覆盖全部写成 .tms-down > button(直接子级)。
      但用户实测 DOM 结构是:
          div.css-g5y9jx.tms-down
            div.css-g5y9jx.r-18u37iz      ← X 改版后新插的一层
              button.css-g5y9jx.r-1777fci
      button 在**第 3 层**,不是直接子级 → > 全部落空 → 一条都没命中。
      症状:按钮**一直存在、也一直是 X 原样的灰色小图标**,用户以为"绿色没生效"。
      诊断(用户跑探针实测):
        document.querySelectorAll('.tms-down').length            = 7   ← 按钮在
        document.querySelector('.tms-down > button')            = null ← CSS 没命中
        document.getElementById('tms-ui-style')                 = 存在 ← 样式标签注入了
      → 三条合起来唯一解释:规则写了、标签注入了、元素匹配不上。
      修法:**全部改成后代选择器(去掉 >)**,并给中间层加一条兜底。
      → 以后 X 再插一层 / 抽一层,这些规则都不用再改。
      教训(§1.10 铁律 #4 同款):**写死 DOM 层数假设 = X 一改版全线静默失效**。
      「代码里有这条规则」和「这条规则真的命中了元素」是两件事,
      必须用 outerHTML 实测验证,不能靠"我写了 !important 所以肯定生效"。
   ══════════════════════════════════════════════════════════════ */
/* ① wrapper:X 给它 padding:8px;margin:-8px;border-radius:9999px,必须压掉 */
.tms-down {display: inline-flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; margin: 0 2px !important; border-radius: 50% !important; transform: translateY(-3px);}
/* ①-b [v0.3.45 新增] 中间层(button 的父级)也要压。
   X 在这层给了自己的 padding / border-radius / 尺寸,不压的话:
     · button 的 34×34 会被这层 padding 顶开 → 绿底比别的按钮大一圈、位置也偏
     · 这层的 border-radius 会跟绿底圆角打架
   用后代选择器一次覆盖任意中间层数量(现在 1 层,以后 2 层也管)。 */
.tms-down > div {padding: 0 !important; margin: 0 !important; background: transparent !important; display: flex !important; align-items: center !important; justify-content: center !important; border-radius: 50% !important; min-width: 0 !important; min-height: 0 !important;}
/* ② 内层 button —— [v0.3.46 用户拍板] 透明底 + 绿色图标,跟 X 其他按钮一模一样
   ⚠️ 背景和边框全部去掉,只剩一个亮绿色的下载图标悬在工具栏里。

   [为什么图标色从 #00d084 改成 #009e66] —— 透明底之后对比要求**变了**:
     有底衬时(绿底白字),图标压深是对的;
     透明底时,图标**直接落在页面上**,亮度要求跟"底色"完全反过来。
     实测(X 自己的图标 #536471 vs 白底 = 6.12,可作为"够显眼"的基准线):
       #00d084 亮绿 vs 白底 = 2.03  ← ❌ 比 X 自己的图标淡一半,加了等于没加
       #00b140       vs 白底 = 2.85  ← 勉强
       #009e66       vs 白底 = 3.45  ← ✅ 白底 3.45 / 深底 4.76,双主题都过 2.5
     → 透明底必须压深,不能沿用"亮绿"。这是本轮唯一的数值决策,其余全是删除。

   [删掉的东西] background / box-shadow(描边+投影)全清,只保留尺寸和布局。
     尺寸 34×34 保留 —— 它决定点击热区大小,去掉会让按钮难点。 */
.tms-down button {width: 34px !important; height: 34px !important; border-radius: 50% !important; background: transparent !important; color: #009e66 !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; transition: background .15s, color .15s, transform .12s !important;}
/* ③ hover —— 跟 X 原生手感一致:淡绿圆底浮出来(不是加深图标)。
   rgba(0,158,102,.12) 实测:白底上合成 #e0f3ed,图标对比仍有 2.99;
   深色主题合成 #133335,对比 3.92 —— 都还在可读区,且淡到跟 X 自己的 hover 一个量级。
   ⚠️ hover 圆底画在 **button** 上(X 原生画在外层 wrapper,这里统一到 button,
      免得两层圆底叠出"双环")。wrapper 和中间层保持透明。 */
.tms-down button:hover {background: rgba(0,158,102,.12) !important; color: #009e66 !important; transform: scale(1.06) !important;}
/* ④ 压掉 X 给 svg 的灰色(X 用 .r-13awgt0 之类 class 上色,克隆时一起带过来)
   [v0.3.42] path/circle/g 的 stroke 兜底 —— SVG 属性选择器优先级高于继承的 color,
   不写这一条 completed/loading 的图标颜色会被 X 的灰赢回去。
   [v0.3.46] 颜色 = 图标绿。 */
.tms-down button > *, .tms-down svg {color: #009e66 !important; background: transparent !important;}
.tms-down button svg path, .tms-down button svg circle, .tms-down button svg g {stroke: currentColor !important;}
.tms-down button:hover svg {color: #009e66 !important;}
/* ⑤ 压掉 X 打在 wrapper / 中间层上的 hover 背景 —— 统一只让 button 出圆底 */
.tms-down:hover, .tms-down > div:hover {background-color: transparent !important;}
.tms-down:focus-within, .tms-down:active {background-color: transparent !important;}
/* ⑥ 四态(v0.3.46 用户拍板:**全部保持绿色**,只靠图标形状区分 ✓ 下载 / ✕ 失败)
   —— 红绿是唯一的成败语义区分这条在 v0.3.44 成立,但有绿底时失败红能一眼分出;
   现在底色透明、图标同为绿色,**只剩形状能区分**,所以跟随用户拍板不再用红色。
   想恢复红色只要改下面三条的 color。
   [加载中] #00b140 略亮一档,转起来有动感(白底 2.85 / 深底 5.77)。
   [失败] 同绿,靠图标里的感叹号形状 + title 文案区分。 */
.tms-down.tms-c button, .tms-down.tms-l button, .tms-down.tms-f button {background: transparent !important;}
.tms-down.tms-c button {color: #009e66 !important;}
.tms-down.tms-l button {color: #00b140 !important;}   /* 下载中:亮一档 */
.tms-down.tms-f button {color: #009e66 !important;}   /* 失败:同绿,靠形状 */
/* v0.1.4:克隆 X 自带按钮结构后,wrap 也加 tms-down class 走同组状态 class(支持 tms-down 跟 tms-btn 两路径)*/
.tms-btn.tms-overlay > svg {color: #fff; filter: drop-shadow(0 0 1px #000);}
/* v0.1.5:CSS 默认让 tms-d g 显示(因为 .tms-down g {display:none} 会让 download 状态也隐藏)
  状态 class(下载/完成/加载/失败)— 同时支持 .tms-btn(自创) 和 .tms-down(克隆) */
.tms-btn g:not(.tms-d):not(.tms-c):not(.tms-l):not(.tms-f), .tms-down g:not(.tms-d):not(.tms-c):not(.tms-l):not(.tms-f) {display: none;}
/* 切到 c/l/f 状态时,显示对应 g(用 > 选择子元素) */
.tms-btn.tms-d > svg > g.tms-d, .tms-btn.tms-c > svg > g.tms-c, .tms-btn.tms-l > svg > g.tms-l, .tms-btn.tms-f > svg > g.tms-f,
/* [v0.3.45] ⚠️ 这三条原来全是 >(要求 svg 是 .tms-down 的直接子级)。
   X 改版后真实结构是 div.tms-down > div.r-18u37iz > button > div > div > svg,
   svg 在**第 5 层** → 三条全落空 → 症状是「点下载后图标不切换 / 不转圈」。
   一律改成后代选择器,以后 X 再插层也不用改。 */
.tms-down.tms-d svg > g.tms-d, .tms-down.tms-c svg > g.tms-c, .tms-down.tms-l svg > g.tms-l, .tms-down.tms-f svg > g.tms-f {display: unset;}
/* v0.1.5 修法:download 状态用 .tms-d 类显式显示,避免跟 X 自带 svg 的 g 冲突 */
.tms-down:not(.tms-c):not(.tms-l):not(.tms-f) svg > g.tms-d {display: unset;}
/* loading 旋转动画(对齐参考 tmd-down.loading) */
.tms-btn.tms-l > svg, .tms-down.tms-l svg {animation: tms-spin 1s linear infinite;}
@keyframes tms-spin {0% {transform: rotate(0deg);} 100% {transform: rotate(360deg);}}
`.replace(/\s+/g, ' ').trim();

  // ===== 20. 油猴菜单(对齐 IG Saver line 1782-1796 思路) =====
  // [v0.3.43] 「📝 设置命名模板」这个菜单改成「打开 ⚙️ 面板」——
  //   模板编辑已经搬进面板(带 chip 点一下就插入 + 实时预览),
  //   再留一个走 prompt 的入口 = 两个编辑入口、两套交互、两边可能存出不同格式。
  //   → 单一真源:模板只在面板里编辑(§1.14「双真值冲突」同款坑)。
  //   「🔄 重置模板」保留在菜单里 —— 它是**一次性动作**,不是编辑器,放菜单里正好。
  //
  // [v0.3.43] 原 HELP_TEXT(一大段 window.prompt 的 help 文案)**已删除**。
  //   删除原因:模板编辑搬进面板后,prompt 入口没了,这 40 行 help 零引用 = 纯死代码。
  //   它承载的知识没丢 —— 全部转成下面的 PLACEHOLDERS 结构化数组,
  //   既当面板 chip 的数据源,又当 hover 提示文案,**单一真源**。
  //   (教训:「文案搬家」最容易漏的坑是把新地方写好了、旧地方忘了删,
  //    下个会话 grep 到旧文案会以为 prompt 入口还在。)
  const PLACEHOLDERS = [
    { key: 'user-name',      desc: '作者昵称' },
    { key: 'user-id',        desc: '@ 账号名' },
    { key: 'status-id',      desc: '推文 ID' },
    { key: 'date-time',      desc: 'UTC 时间 YYYYMMDD-hhmmss,可加 :格式' },
    { key: 'date-time-local', desc: '本地时间,同上' },
    { key: 'full-text',      desc: '正文首行(清洗 t.co,截 60 字)' },
    { key: 'file-type',      desc: 'photo / video / gif' },
    { key: 'file-name',      desc: 'X 原始文件名 stem' },
  ];
  // 日期格式 token(用于 {date-time:格式}),面板里以纯文本展示
  const DATE_TOKENS = 'YYYY YY MMM MM DD hh mm ss h2 ap';
  // 模板预览:用假数据跑一遍 renderTemplate,把 {xxx} 换成看得懂的示例值。
  //   作用 = 用户在面板里改模板时立刻知道会得到什么文件名,不用先下载试错。
  // [v0.3.47] 示例数据改用中性占位,**不再写死任何真实昵称 / 账号**
  //   (v0.3.43~v0.3.46 的预览里一直写着用户的真实昵称和账号,用户明确要求去掉自己的称谓)。
  //   现在写「作者昵称 / username」—— 一眼就知道这是占位,不会被误当成真名。
  //   **注意**:注释里也不要出现真名 —— 否则下次 grep 自查会误判"还有残留",反复返工。
  const previewTpl = (tpl) => {
    const demo = {
      userName: '作者昵称', userId: 'username', statusId: '1234567890',
      createdAt: 'Wed Oct 15 08:30:00 +0000 2026', fullText: '这是一条用于预览的示例推文正文',
      index: 1,
    };
    const media = { type: 'photo', ext: 'jpg', url: 'https://pbs.twimg.com/media/AbCdEfGhIjKl.jpg' };
    try {
      return renderTemplate(tpl || TPL_DEFAULT, demo, media);
    } catch (e) {
      return '预览出错: ' + e.message;
    }
  };

  // [v0.3.43] 模板编辑已搬进 ⚙️ 面板(textarea + 占位符 chip + 实时预览)。
  //   这个菜单改成打开面板 —— 单一编辑入口,不再有「面板改一份、prompt 改一份」的双真值。
  //   ⚠️ 注意油猴 sandbox 铁律(§1.12):callback 闭包**不能引用 page script 函数**。
  //   `showWidthPanel` 正是 page script 函数,直接传进去 = 100% throw "invalid name"。
  //   → 这里只打一条提示 log,不挂任何闭包(console.log 是原生 API,不是 page script 函数)。
  GM_registerMenuCommand('⚙️ 打开设置面板(模板 + 宽度)', () => {
    console.log(`%c[tms ${TMS_VER}] 点页面左下角的 ⚙️ 蓝色按钮打开设置面板(命名模板 + 三栏宽度都在里面)。`, 'color:#1d9bf0;');
  });

  GM_registerMenuCommand('🔄 重置模板', () => {
    setTemplate(TPL_DEFAULT);
    Toast.show('命名模板已重置为默认', 'ok');
    const panelTa = document.getElementById('tms-tpl-input');
    if (panelTa) panelTa.value = TPL_DEFAULT;   // 面板开着就同步,别让面板显示旧值
    const pv = document.getElementById('tms-tpl-preview');
    if (pv) pv.textContent = previewTpl(TPL_DEFAULT);
    console.log(`[tms ${TMS_VER}] 模板已重置: ${TPL_DEFAULT}`);
  });

  // ===== 21. 启动 =====
  // [v0.3.42] 三处 DOM 访问全部加 || document.documentElement 双保险。
  //   真因:@run-at 已改回 document-end(head/body 都存在),但万一油猴调度时机
  //   变化或用户手动改回 document-start,裸访问 head/body 会 TypeError 中断整个 IIFE。
  //   documentElement 在任何文档状态下都存在(fact #520 实测结论),是最稳的兜底根。
  // [v0.3.43 上提] headRoot 已移到 IIFE 第一行(Toast / TUI 都要用它),
  //   这里不再重复声明,直接用。
  const style = document.createElement('style');
  style.textContent = CSS;
  headRoot().appendChild(style);

  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) detect(n);
      });
    }
  });
  // [v0.3.42] observe 根同样兜底:document.body 可能为 null(document-start 时),
  //   documentElement 一定有,二者对 MutationObserver 的子树监听等价。
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll('article, li[role="listitem"]').forEach(detect);

  // ---- G. (v0.3.0 新增) 面板宽度 ----
  // [v0.3.37] 加宽 UI 面板 (不用 GM_registerMenuCommand, 油猴 sandbox throw "invalid name")
  // 修法: 改用 GM_getValue/GM_setValue 读值, 写值, 改完调 applyWidthStyles 重写 CSS
  // UI 用一个悬浮按钮 + 姐姐自己写的 HTML 面板 (不经过油猴 wrapper 验证)
  // v0.3.39 根因修复:4 个控件(右栏宽度 rw / 填满 fc / 隐藏左 hl / 隐藏右 hr)
  // 在 v0.3.31 抄 v9.4 架构时被整段丢失 —— v0.3.38 的 buildWidthCss 只插值了
  // ${lw} 和 ${target},rw/fc/hl/hr 全部"读了不用",面板上 4 个控件是空壳:
  //   勾「隐藏左栏/隐藏右栏/中间填满」→ 日志打 ✅ 已应用 → 页面 0 变化
  //   拖「右栏宽度」→ GM_setValue 写进去了 → buildWidthCss 从不引用 → 0 变化
  // 修法: 把 v0.3.30(最后一次右栏 CSS 还在的版本)的分支逻辑原样搬回,
  //       叠加 v0.3.38 已有的 v9.4 内层 flex CSS(不删任何现有规则)。
  function buildInnerFlexCss() {
    // v0.3.6/v9.4:推文卡 4 层 flex 嵌套 + 媒体不撑爆(保 v0.3.38 原样,一行不动)
    const primary = 'main div[data-testid="primaryColumn"]';
    return `
      ${primary} > div,
      ${primary} > div > div,
      ${primary} section {
        width: 100% !important;
        max-width: none !important;
      }
      ${primary} div[data-testid="cellInnerDiv"] {
        width: 100% !important;
        max-width: none !important;
      }
      ${primary} div.r-1h3ijdo,
      ${primary} div.r-1e5uvyk,
      ${primary} div.r-5zmot,
      ${primary} div.r-136ojw6,
      ${primary} div.r-1loqt21 {
        width: 100% !important;
        max-width: none !important;
      }
      ${primary} div.r-1awozwy.r-18u37iz {
        width: 100% !important;
        display: flex !important;
        flex-direction: row !important;
      }
      ${primary} div.r-1awozwy.r-18u37iz > div:first-child {
        width: auto !important;
        flex-shrink: 0 !important;
      }
      ${primary} div.r-1awozwy.r-18u37iz > div.r-16y2uox {
        flex-grow: 1 !important;
        width: auto !important;
      }
      ${primary} div.r-1awozwy.r-18u37iz > div:last-child {
        width: auto !important;
        flex-shrink: 0 !important;
      }
      ${primary} div.css-175oi2r,
      main section[role="region"] div.css-175oi2r {
        max-width: none !important;
      }
      main div[role="group"],
      main div.r-1kbdv8c {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }
    `;
  }
  function buildWidthCss() {
    const tw = getTimelineWidth();
    const lw = getLeftbarWidth();
    const rw = getRightbarWidth();
    const fc = getFillCenter();
    const hl = getHideLeftbar();
    const hr = getHideRightbar();
    // [v0.3.39] 宽度值统一走 WIDTH_LIMITS 钳制(v0.3.38 里 WIDTH_LIMITS 是死代码,
    // 面板 slider 上限 1800 与常量 [500,1500] 不一致 → 拖到 1800 不会被拦)
    const twv = clampW(tw, WIDTH_LIMITS.timeline);
    const lwv = clampW(lw, WIDTH_LIMITS.leftbar);
    const rwv = clampW(rw, WIDTH_LIMITS.rightbar);
    const primary = 'main div[data-testid="primaryColumn"]';
    const leftbarCss = hl
      ? 'header[role="banner"] { display: none !important; }'
      : `header[role="banner"] > div:first-child, header[role="banner"] .r-o96wvk, .r-o96wvk { width: ${lwv}px !important; }`;
    // [v0.3.39] 右栏:宽度 4 重钉(min/max/flex-shrink)+ 隐藏开关,原来 2 个都没有
    const rightbarCss = hr
      ? '[data-testid="sidebarColumn"] { display: none !important; }'
      : `[data-testid="sidebarColumn"] {
          width: ${rwv}px !important;
          min-width: ${rwv}px !important;
          max-width: ${rwv}px !important;
          flex-shrink: 0 !important;
        }`;
    // 特殊页(私讯/设置):不套时间轴/右栏,只处理左栏
    const isSpecial = /^\/(messages|settings)/.test(location.pathname);
    if (isSpecial) {
      return `
        main[role="main"],
        main.css-175oi2r {
          width: 100% !important;
          max-width: none !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        ${leftbarCss}
        ${hr ? '' : rightbarCss}
        ${primary},
        main section[role="region"] > div {
          width: 100% !important;
          max-width: none !important;
        }
      `;
    }
    // 软约束:总宽超视窗只 warn,不阻塞(v0.3.30 原行为)
    const totalW = (hl ? 0 : lwv) + (fc ? 0 : twv) + (hr ? 0 : rwv);
    if (typeof window !== 'undefined' && totalW > window.innerWidth - 40) {
      console.warn(`[tms ${TMS_VER}] 提示:三栏总宽 ${totalW}px > 视窗 ${window.innerWidth}px,可能被挤出屏。建议调小某栏或勾选「中间填满」。`);
    }
    // [v0.3.39] fillCenter 之前完全没实现 → 主栏占满 viewport,右栏保留但不挤压主栏
    const mainWidthCss = fc
      ? `width: 100% !important;`
      : `width: ${twv}px !important;`;
    return `
      main[role="main"],
      main.css-175oi2r {
        width: 100% !important;
        max-width: none !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      ${leftbarCss}
      ${rightbarCss}
      ${primary},
      main section[role="region"] > div,
      main .r-1ye8kvj {
        ${mainWidthCss}
        max-width: none !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      ${buildInnerFlexCss()}
    `;
  }
    function applyWidthStyles() {
      let el = document.getElementById('tm-timeline-inner-lock');
      if (!el) {
        el = document.createElement('style');
        el.id = 'tm-timeline-inner-lock';
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = buildWidthCss();
      // [v0.3.39 删除] 原来每次 applyWidthStyles 都打 3 条 log(标签已创建 / 已存在 / CSS 已写入)。
      //   删除原因:applyWidthStyles 在启动 + 每次点「应用」都会跑,用户控制台被刷屏。
      //   诊断价值 ≈ 0(§1.13 段 A 探针照样能查 style 标签),噪音成本实在。
      //   保留唯一一条 INSTALLED log 作为"脚本装上了没"的判据(§1.7 铁律)。
    }
    // [v0.3.37] 启动调一次 (跟 v9.4 line 819 一样) — 不用 setTimeout 不用 MutationObserver
    if (document.body) {
      applyWidthStyles();
    } else {
      document.addEventListener('DOMContentLoaded', () => applyWidthStyles());
    }
  
    console.log(`%c[tms ✅ INSTALLED v${TMS_VER}] loaded — Twitter Media Saver ready. 下载: 原生格式 + name=orig (v0.3.38 修复 PNG 原图 404, X 不支持服务端转码) | v0.3.39: 修复 4 个加宽控件空壳 + 纯 HLS 如实提示 + 文件名收敛 + clean 过滤 | v0.3.40: 面板玻璃拟态 UI + 自动跟随 X 深浅色主题 | v0.3.41: 下载按钮改 X 蓝实心(工具栏 + 媒体 tab 统一) | v0.3.42: 修 @run-at 启动崩溃 + 按钮对比度加深(#1d9bf0→#1677c4, 白底 3.00→4.70) + SVG 配色交回 CSS | v0.3.43: 命名模板搬进面板(textarea + 占位符 chip + 实时预览, 干掉 window.prompt) + 滑块即时生效(去掉「应用」) + 下载进度徽标与 toast + ⚙️ 移左下角可拖动(SVG 图标 + 位置记忆) + 修引用推文计数恒为 0 | v0.3.44: 下载按钮改亮绿 #00d084 + 深色图标 + 深色描边 + 四态全绿调 | v0.3.45: 修 X 改版后 button 不再是直接子级(v0.3.41~v0.3.44 四版 CSS 全部静默失效) | v0.3.46: 下载按钮改透明底 + 绿色图标 | v0.3.47: 面板预览的示例数据去掉真实昵称, 改中性占位 | 面板: 左下角 ⚙️ (可拖动, 位置自动记忆) | 当前模板: ${getTemplate()}` +
      '', 'color: #00ff00; font-weight: bold; font-size: 14px;');
  
    // [v0.3.37] 关键 — 加宽 UI 面板 (用姐姐自己写的 HTML, 不调 GM_registerMenuCommand)
    // 真因: 5 个加宽菜单的 callback 闭包引用 page script 函数 → 油猴 wrapper 验证 → throw "invalid name"
    // 修法: 油猴 0 加宽菜单, 改用 1 个悬浮按钮 + 姐姐自己写的 HTML 面板 (不经过油猴 wrapper 验证)
  // ================================================================
  // ===== G2. v0.3.40 UI 美化:玻璃拟态 + X 双主题自动跟随 =====
  // ================================================================
  // 拍板(用户 2026-10-16):方案 A 玻璃拟态 + 自动跟随 X 主题 + 下载按钮改圆形。
  //
  // 【为什么不用 X 内部 class 判主题】
  //   X 改版多次,主题标记从 html:not(.has-z-index) 换成 html[data-color-mode],
  //   还在换。写死任何一个 class 都会在某次改版后失效(§1.10 铁律同款问题)。
  //   → 改用「实测背景亮度」:getComputedStyle 拿 body/html 的 background-color,
  //     算 WCAG 相对亮度,<0.5 判深色。任何主题机制下都准,不依赖 X 内部实现。
  //   → 再叠一层 MutationObserver 监听 <html> 的 class/style,用户手动切主题时立刻重算。
  // ⚠️⚠️ [v0.3.43 P0 · jsdom 实跑才抓到,node --check 抓不到] buildCss 的返回值是
  // **反引号模板字符串**,所以**这个函数体里的 CSS 注释里绝对不能出现反引号**。
  //   真因:注释里写 `.tms-apply` / `.tms-down` 这种带反引号的选择器名
  //         → 模板在那一行被提前闭合 → 后半段 CSS 变成裸 JS 代码
  //         → **node --check 依然通过**(因为拼起来仍是合法 JS!)
  //         → 运行时 buildCss() 第一句就 ReferenceError: apply is not defined
  //         → TUI.init() 崩 → 面板样式 / toast / badge / fab 全都没有,
  //           症状是"⚙️ 不出现"(跟 v0.3.42 的 @run-at P0 症状一模一样,极易误判)。
  //   教训:**语法检查通过 ≠ 能跑**。凡是「函数返回一个模板字符串 + 字符串里有注释」
  //         这类结构,必须 (a) 注释里禁用反引号 (b) 真在 jsdom 里 eval 一遍整个脚本。
  //   本轮就是靠 §1.14 第 4 步的 jsdom 真跑抓到的,纯静态断言 213 条全绿也照样漏。
  //   下方 CSS 注释里的选择器一律写成不带反引号的裸类名。
  const TUI = {
    dark: true,
    detect() {
      const el = document.querySelector('main[role="main"]') || document.body || document.documentElement;
      let c = '';
      try { c = getComputedStyle(el).backgroundColor || getComputedStyle(document.body).backgroundColor; } catch (e) { /* 跨域 iframe 拿不到 */ }
      if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') {
        // 退到 body,再退到系统偏好
        try { c = getComputedStyle(document.body).backgroundColor; } catch (e) { /* ignore */ }
      }
      if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') {
        return !window.matchMedia || !window.matchMedia('(prefers-color-scheme: dark)').matches ? false : true;
      }
      const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
      if (!m) return true;
      const [r, g, b] = [1, 2, 3].map((i) => {
        const v = parseFloat(m[i]) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const dark = lum < 0.5;
      return dark;
    },
    sync() {
      const d = this.detect();
      if (d !== this.dark) { this.dark = d; this.apply(); }
      return d;
    },
    apply() {
      const s = document.getElementById('tms-ui-style');
      if (s) s.textContent = TUI.buildCss(this.dark);
    },
    // ---- 玻璃拟态配色 ----
    buildCss(dark) {
      const c = dark ? {
        bg: 'rgba(22, 27, 38, 0.82)', bd: 'rgba(255, 255, 255, 0.10)',
        tint: 'linear-gradient(135deg, rgba(29,155,240,.18), transparent)',
        tx: '#e8ecf4', dim: '#8b95a9', x: '#c8d2e0',
        numBg: 'rgba(255,255,255,.06)', numBd: 'rgba(255,255,255,.11)',
        rng: 'rgba(255,255,255,.14)', stpBg: 'rgba(255,255,255,.09)', stpBd: 'rgba(255,255,255,.09)',
        div: 'rgba(255,255,255,.09)', bxBg: 'rgba(255,255,255,.10)', bxBd: 'rgba(255,255,255,.16)',
        bxOn: '#1d9bf0', bxOnTx: '#04121d', chkOn: '#ffffff',
        // [v0.3.43 删除] btn / btnSh 两个字段:原「应用」主按钮用的,
        //   改成即时生效后主按钮消失,这两个字段零引用 = 死字段(§1.14「死代码」行)。
        fab: 'rgba(29,155,240,.90)', fabBd: 'rgba(255,255,255,.16)', fabSh: '0 8px 28px rgba(29,155,240,.42)',
        sh: '0 20px 60px rgba(0,0,0,.5)',
      } : {
        bg: 'rgba(255, 255, 255, 0.80)', bd: 'rgba(15, 23, 42, 0.10)',
        tint: 'linear-gradient(135deg, rgba(29,155,240,.14), transparent)',
        tx: '#0f1419', dim: '#536471', x: '#536471',
        numBg: 'rgba(15,23,42,.04)', numBd: 'rgba(15,23,42,.12)',
        rng: 'rgba(15,23,42,.14)', stpBg: 'rgba(15,23,42,.05)', stpBd: 'rgba(15,23,42,.09)',
        div: 'rgba(15,23,42,.09)', bxBg: 'rgba(15,23,42,.05)', bxBd: 'rgba(15,23,42,.16)',
        bxOn: '#1d9bf0', bxOnTx: '#ffffff', chkOn: '#0f1419',
        // [v0.3.43 删除] btn / btnSh — 同上,浅色分支的对应死字段
        fab: 'rgba(29,155,240,.92)', fabBd: 'rgba(255,255,255,.6)', fabSh: '0 8px 28px rgba(29,155,240,.34)',
        sh: '0 20px 60px rgba(15,23,42,.16)',
      };
      return `
#tms-width-panel {
  position: fixed; top: 20px; right: 20px; z-index: 999999;
  width: 320px; padding: 0; border-radius: 16px; overflow: hidden;
  background: ${c.bg}; color: ${c.tx};
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid ${c.bd}; box-shadow: ${c.sh};
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  animation: tmsPanelIn .18s cubic-bezier(.2,.9,.3,1);
}
@keyframes tmsPanelIn { from { opacity:0; transform: translateY(-8px) scale(.98);} to { opacity:1; transform:none; } }
#tms-width-panel .tms-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; background: ${c.tint};
}
#tms-width-panel .tms-hd-t { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 14px; }
#tms-width-panel .tms-x {
  width: 24px; height: 24px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 15px; line-height: 1; color: ${c.x};
  background: ${c.stpBg}; border: 1px solid ${c.stpBd};
  transition: background .15s;
}
#tms-width-panel .tms-x:hover { background: ${dark ? 'rgba(255,255,255,.16)' : 'rgba(15,23,42,.10)'}; }
#tms-width-panel .tms-sub { font-size: 11px; color: ${c.dim}; padding: 0 16px 10px; }
#tms-width-panel .tms-row { display: flex; align-items: center; gap: 10px; padding: 7px 16px; }
#tms-width-panel .tms-lb { flex: 0 0 52px; font-size: 12px; color: ${c.dim}; }
#tms-width-panel .tms-num {
  width: 58px; padding: 5px 7px; text-align: center;
  font: 600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  border-radius: 7px; color: ${c.tx};
  background: ${c.numBg}; border: 1px solid ${c.numBd};
  transition: border-color .15s;
}
#tms-width-panel .tms-num:focus { outline: none; border-color: #1d9bf0; }
#tms-width-panel .tms-rng { flex: 1; -webkit-appearance: none; appearance: none; height: 5px; border-radius: 99px; outline: none; background: ${c.rng}; }
#tms-width-panel .tms-rng::-webkit-slider-thumb {
  -webkit-appearance: none; width: 15px; height: 15px; border-radius: 50%;
  background: ${dark ? '#fff' : '#1d9bf0'}; box-shadow: 0 1px 5px rgba(0,0,0,.45); cursor: pointer;
  transition: transform .12s;
}
#tms-width-panel .tms-rng::-webkit-slider-thumb:hover { transform: scale(1.15); }
#tms-width-panel .tms-stp {
  width: 24px; height: 24px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; font: 600 14px/1 sans-serif; flex-shrink: 0;
  color: ${c.tx}; background: ${c.stpBg}; border: 1px solid ${c.stpBd}; transition: background .15s;
}
#tms-width-panel .tms-stp:hover { background: ${dark ? 'rgba(255,255,255,.18)' : 'rgba(15,23,42,.10)'}; }
#tms-width-panel .tms-div { height: 1px; background: ${c.div}; margin: 10px 16px; }
#tms-width-panel .tms-chk {
  display: flex; align-items: center; gap: 9px; padding: 7px 16px;
  cursor: pointer; font-size: 12.5px; color: ${c.tx}; user-select: none;
}
#tms-width-panel .tms-chk input { display: none; }
#tms-width-panel .tms-bx {
  width: 17px; height: 17px; border-radius: 5px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: transparent; background: ${c.bxBg}; border: 1px solid ${c.bxBd};
  transition: background .15s, border-color .15s;
}
#tms-width-panel .tms-chk.on .tms-bx { background: ${c.bxOn}; border-color: ${c.bxOn}; color: ${c.bxOnTx}; }
#tms-width-panel .tms-chk.on { color: ${dark ? '#fff' : '#0f1419'}; font-weight: 600; }
/* ---- [v0.3.43] 次级小按钮(恢复默认模板)----
   [v0.3.43 删除] 原 .tms-apply 三条规则(主按钮蓝底 + hover + active)已删。
   删除原因:面板不再有「应用」按钮 —— 滑块/勾选改成即时生效,点「应用」这步没了。
   留着 = 零元素匹配的纯死 CSS,而且会让下个会话以为面板还有"应用"这一步
   (§1.14「空壳 / 死代码」同款坑:DOM 与 CSS 必须同步维护)。 */
#tms-width-panel .tms-mini {
  padding: 5px 12px; border-radius: 8px; cursor: pointer;
  font: 600 11.5px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  color: ${c.dim}; background: ${c.stpBg}; border: 1px solid ${c.stpBd};
  transition: background .15s, color .15s, border-color .15s;
}
#tms-width-panel .tms-mini:hover {
  color: #fff; background: #0f6cba; border-color: #0f6cba;
}
#tms-width-panel .tms-foot { text-align: center; font-size: 11px; color: ${c.dim}; padding-bottom: 13px; }
#tms-fab {
  position: fixed; bottom: 20px; left: 20px; z-index: 999998;
  width: 50px; height: 50px; border-radius: 50%;
  background: ${c.fab}; color: #fff; font-size: 23px;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  border: 1px solid ${c.fabBd}; box-shadow: ${c.fabSh};
  transition: transform .15s;
  /* [v0.3.43] 可拖动:位置存 GM,靠 left/top 内联定位(不用 transform,免得跟 hover 缩放打架) */
  touch-action: none;
}
#tms-fab:hover { transform: scale(1.08); }
#tms-fab:active { transform: scale(.96); }
#tms-fab.dragging { cursor: grabbing; transform: scale(1.12); box-shadow: 0 12px 34px rgba(29,155,240,.55); }
#tms-fab svg { width: 24px; height: 24px; display: block; }
/* ---- [v0.3.43] 下载进度 toast(底部居中浮层) ---- */
#tms-toast {
  position: fixed; left: 50%; bottom: 26px; transform: translate(-50%, 14px);
  z-index: 999997; max-width: min(520px, 86vw);
  padding: 10px 16px; border-radius: 12px;
  background: ${c.bg}; color: ${c.tx}; font-size: 12.5px; line-height: 1.5;
  word-break: break-all;
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid ${c.bd}; box-shadow: ${c.sh};
  pointer-events: none; opacity: 0; transition: opacity .2s, transform .2s cubic-bezier(.2,.9,.3,1);
}
#tms-toast.on { opacity: 1; transform: translate(-50%, 0); }
#tms-toast.ok   { border-left: 3px solid #009e66; }
#tms-toast.warn { border-left: 3px solid #c2751a; }
#tms-toast.err  { border-left: 3px solid #d4212f; }
/* ---- [v0.3.43] 按钮计数徽标(右上角小圆角,压在下载按钮上) ----
   ⚠️ .tms-down 是 cloneNode 出来的 X wrapper,带着 X 自己的 r-* class,
      X 可能给它写了 position。所以这条必须 !important —— 否则徽标的
      absolute 定位锚点会跑到最近的 X 祖先上,徽标飞到屏幕另一处(极难查)。 */
.tms-down, .tms-btn { position: relative !important; }
.tms-badge {
  position: absolute; top: -7px; right: -7px; z-index: 3;
  min-width: 19px; height: 19px; padding: 0 5px;
  /* [v0.3.46] 徽标跟随"透明底"设计:淡绿底 + 绿字,不再实心绿块 */
  border-radius: 10px; background: rgba(0,158,102,.16); color: #00855a;
  font: 700 10px/19px ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: center; white-space: nowrap; pointer-events: none;
  /* [v0.3.46] 描边改成跟随页面背景的极淡阴影,不再用纯白/纯黑实圈 */
  box-shadow: 0 1px 3px rgba(0,0,0,.18);
}
/* [v0.3.46] 四态徽标全部同色(跟"图标全绿"的拍板一致),只靠文字内容区分计数 */
.tms-down.tms-c .tms-badge, .tms-btn.tms-c .tms-badge { background: rgba(0,158,102,.16); color: #00855a; }
.tms-down.tms-f .tms-badge, .tms-btn.tms-f .tms-badge { background: rgba(0,158,102,.16); color: #00855a; }
/* ---- [v0.3.43] 面板:命名模板区(textarea + chip + 预览) ---- */
#tms-width-panel .tms-sec {
  display: flex; align-items: center; gap: 8px;
  padding: 13px 16px 6px; font-size: 11.5px; font-weight: 700;
  color: ${c.dim}; letter-spacing: .04em; text-transform: uppercase;
}
#tms-width-panel .tms-sec::after { content: ''; flex: 1; height: 1px; background: ${c.div}; }
#tms-width-panel .tms-ta {
  display: block; width: calc(100% - 32px); margin: 0 16px;
  padding: 8px 10px; border-radius: 9px; resize: vertical;
  min-height: 58px; max-height: 140px;
  font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: ${c.tx}; background: ${c.numBg}; border: 1px solid ${c.numBd};
  transition: border-color .15s;
}
#tms-width-panel .tms-ta:focus { outline: none; border-color: #1677c4; }
#tms-width-panel .tms-chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 8px 16px 0; }
#tms-width-panel .tms-chip {
  padding: 3px 8px; border-radius: 7px; cursor: pointer;
  font: 500 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: ${c.tx}; background: ${c.bxBg}; border: 1px solid ${c.bxBd};
  transition: background .15s, border-color .15s, color .15s;
}
#tms-width-panel .tms-chip:hover { background: #1677c4; border-color: #1677c4; color: #fff; }
#tms-width-panel .tms-tokens {
  padding: 7px 16px 0; font-size: 10.5px; line-height: 1.5; color: ${c.dim};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all;
}
#tms-width-panel .tms-pv {
  margin: 9px 16px 0; padding: 8px 10px; border-radius: 9px;
  font: 11.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: ${c.dim}; background: ${c.stpBg}; border: 1px dashed ${c.rng};
  word-break: break-all; user-select: all;
}
#tms-width-panel .tms-pv b { color: ${c.tx}; font-weight: 600; }
/* [v0.3.43] 滑块即时生效:左侧一条"已实时生效"指示,让用户知道不用再点应用 */
#tms-width-panel .tms-live {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 16px 0; font-size: 11px; color: ${c.dim};
}
#tms-width-panel .tms-live .tms-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #00ba7c;
  box-shadow: 0 0 0 3px rgba(0,186,124,.18);
}
/* ---- [v0.3.40] 下载按钮改圆形图标,跟 X 原生工具栏一致 ---- */
/* ---- [v0.3.42] 下载按钮对比度修复 —— 白底下太淡,看不清 ----
   实测(WCAG 相对亮度):旧值 #1d9bf0 vs 白色页面 = 3.00,正好卡在非文本对比下限,
   视觉上就是"淡"。新值 #1677c4 = 4.70。加 2px 白描边把按钮从白底上"抠"出来。 */
.tms-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; margin-left: 12px; border-radius: 50%;
  cursor: pointer; color: rgb(83, 100, 113);
  background: transparent; border: none;
  transition: background .15s, color .15s;
}
.tms-btn:hover { background: #00ab6d !important; color: #04121d !important; transform: scale(1.06); }
/* ---- 媒体 tab 浮层按钮:统一成工具栏方案 + 白描边 ----
   [v0.3.42] 半透明 .88 → 不透明 #1677c4(半透明会实打实拉低白底对比度),
   并加白描边 —— 它压在图片/视频缩略图上,描边是唯一的边界保证。 */
/* [v0.3.44] 浮层按钮同步改绿 + 深色图标。描边从白 rgba(.9) 换深色 —— 它压在
   缩略图上(底色不可控),深描边在明暗两种缩略图上都能给出边界。 */
.tms-btn.tms-overlay { position: absolute; right: 8px; bottom: 8px; padding: 0; background: #00d084 !important; color: #04121d !important; border: none; box-shadow: 0 0 0 2px #04121d, 0 3px 12px rgba(0,0,0,.35); }
.tms-btn.tms-overlay:hover { background: #00ab6d !important; color: #04121d !important; transform: scale(1.06); }
/* 四种状态配色(跟 .tms-down 同步,v0.3.44 全绿调) */
.tms-btn.tms-c { background: #009e66 !important; color: #04121d !important; }
.tms-btn.tms-l { background: #00e39a !important; color: #04121d !important; }
.tms-btn.tms-f { background: #d4212f !important; color: #fff !important; }
/* [v0.3.44] overlay 的 svg 要盖住上面 .tms-btn 的灰 color(默认态) */
.tms-btn.tms-overlay { color: #04121d !important; }
/* [v0.3.42] 图标 stroke 兜底 —— SVG 属性优先级高于继承 color,不压这条 completed/loading 会被 X 赢回 */
.tms-btn svg path, .tms-btn svg circle, .tms-btn svg g { stroke: currentColor; }
`;
    },
    init() {
      const s = document.createElement('style');
      s.id = 'tms-ui-style';
      headRoot().appendChild(s);
      this.dark = this.detect();
      s.textContent = this.buildCss(this.dark);
      // 用户在 X 设置里手动切主题 → 立刻重算
      const mo = new MutationObserver(() => this.sync());
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-color-mode'] });
      // 系统主题跟随(用户改系统深浅色)
      try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.sync()); } catch (e) { /* 老浏览器 */ }
      return this;
    },
  };
  TUI.init();

  function showWidthPanel() {
    let panel = document.getElementById('tms-width-panel');
    // 已开着 → 走面板自己的关闭入口(会解绑 mousedown 监听),
    // 而不是直接 panel.remove() —— 直接 remove 会把 _outsideClose 监听留在 document 上。
    if (panel) { (panel._close || (() => panel.remove()))(); return; }
    panel = document.createElement('div');
    panel.id = 'tms-width-panel';
    // sliders: slider + 数字 input + +/- 步进按钮(交互逻辑与 v0.3.37 完全一致,只换外观)
    const sliders = (id, label, min, max, val) => `
      <div class="tms-row">
        <span class="tms-lb">${label}</span>
        <input type="number" class="tms-num" min="${min}" max="${max}" value="${val}" id="${id}-num">
        <input type="range" class="tms-rng" min="${min}" max="${max}" value="${val}" id="${id}">
        <button class="tms-stp" data-target="${id}" data-step="-10">−</button>
        <button class="tms-stp" data-target="${id}" data-step="10">+</button>
      </div>
    `;
    // [v0.3.39 删除] 曾经的 `slider(key,min,max,label)` 与 `cb(key,label)` 两个辅助函数已移除。
    //   删除原因:零调用(面板实际用的是上面的 `sliders(...)` + 手写 label),
    //   且这两个还引用了从不被读写的 `window.__tms_ui_*` 全局变量 ——
    //   留着会让下个会话误以为面板靠这套全局变量通信。纯误导性死代码。
    const tw = GM_getValue(WIDTH_KEYS.timeline, 1200);
    const lw = GM_getValue(WIDTH_KEYS.leftbar, 275);
    const rw = GM_getValue(WIDTH_KEYS.rightbar, 350);
    const fc = GM_getValue(WIDTH_KEYS.fillCenter, false);
    const hl = GM_getValue(WIDTH_KEYS.hideLeftbar, false);
    const hr = GM_getValue(WIDTH_KEYS.hideRightbar, false);
    const onoff = (v) => (v ? ' on' : '');
    // [v0.3.43] 占位符 chip:title 用 PLACEHOLDERS 里的 desc(结构化单一真源)
    const chipHtml = PLACEHOLDERS.map((p) =>
      `<span class="tms-chip" data-key="${p.key}" title="${p.desc}">{${p.key}}</span>`).join('');
    panel.innerHTML = `
      <div class="tms-hd">
        <div class="tms-hd-t">⚙️ 设置</div>
        <div class="tms-x" id="tms-panel-close">✕</div>
      </div>

      <div class="tms-sec">文件名模板</div>
      <textarea class="tms-ta" id="tms-tpl-input" spellcheck="false"
        placeholder="{user-name}(@{user-id})_{date-time}_{status-id}_{file-type}"></textarea>
      <div class="tms-chips" id="tms-tpl-chips">${chipHtml}</div>
      <div class="tms-tokens">日期格式 token(用于 {date-time:格式}):${DATE_TOKENS}</div>
      <div class="tms-pv">示例 → <b id="tms-tpl-preview"></b></div>
      <div class="tms-row" style="padding-top:9px">
        <button class="tms-mini" id="tms-tpl-reset">恢复默认模板</button>
      </div>

      <div class="tms-sec">布局宽度</div>
      <div class="tms-live"><span class="tms-dot"></span>改动即时生效,无需点应用</div>
      ${sliders('tms-tw', '时间轴', WIDTH_LIMITS.timeline[0], WIDTH_LIMITS.timeline[1], tw)}
      ${sliders('tms-lw', '左栏', WIDTH_LIMITS.leftbar[0], WIDTH_LIMITS.leftbar[1], lw)}
      ${sliders('tms-rw', '右栏', WIDTH_LIMITS.rightbar[0], WIDTH_LIMITS.rightbar[1], rw)}
      <div class="tms-div"></div>
      <label class="tms-chk${onoff(fc)}" id="tms-fc-lb"><input type="checkbox" id="tms-fc" ${fc ? 'checked' : ''}><span class="tms-bx">✓</span>中间填满</label>
      <label class="tms-chk${onoff(hl)}" id="tms-hl-lb"><input type="checkbox" id="tms-hl" ${hl ? 'checked' : ''}><span class="tms-bx">✓</span>隐藏左栏</label>
      <label class="tms-chk${onoff(hr)}" id="tms-hr-lb"><input type="checkbox" id="tms-hr" ${hr ? 'checked' : ''}><span class="tms-bx">✓</span>隐藏右栏</label>
      <div class="tms-foot">点左下角 ⚙️ 重新打开 · 按钮可拖动</div>
    `;
    document.body.appendChild(panel);
    // [v0.3.43] 统一关闭入口。三条关闭路径(✕ / 点外面 / 再点 ⚙️)都走它。
    //   为什么必须统一:每条路径都要**同时**做两件事 —— 移除面板 + 解绑 document 上的
    //   mousedown 监听。以前 ✕ 只 remove(),监听留着 → 下次点页面任意处都会触发
    //   _outsideClose → 对着一个已经不在 DOM 里的 panel 调 remove()(无害,但白跑),
    //   真正的问题是那个残留监听会一直累积(每开一次面板多一个)。
    const closePanel = () => {
      document.removeEventListener('mousedown', panel._outsideClose, true);
      panel.remove();
    };
    document.getElementById('tms-panel-close').onclick = closePanel;
    panel._close = closePanel;   // 供 showWidthPanel 的开关分支复用(会解绑监听)
    // 点击面板外部关闭 —— 面板是即时生效的,不需要"保存"步骤,所以点外面就该走
    panel._outsideClose = (e) => {
      // 点到 fab 本身不算"外面":让 fab 的 click 去处理开关,否则会出现
      // mousedown 先关面板、click 又把面板开回来的"关不掉"问题。
      if (!panel.contains(e.target) && !document.getElementById('tms-fab')?.contains(e.target)) {
        closePanel();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', panel._outsideClose, true), 0);

    // ---- [v0.3.43] 命名模板区:input 即时保存 + chip 插入 + 实时预览 ----
    const ta = document.getElementById('tms-tpl-input');
    const pv = document.getElementById('tms-tpl-preview');
    const saveTpl = () => {
      const v = ta.value.trim();
      // 空模板 = 用默认,不写空串进 GM(否则 renderTemplate 会拿空串当模板)
      setTemplate(v || TPL_DEFAULT);
      pv.textContent = previewTpl(v);
    };
    ta.value = getTemplate();
    pv.textContent = previewTpl(ta.value);
    ta.addEventListener('input', saveTpl);
    // chip:插到当前光标位置(不是末尾 —— 用户可能正在中间改一段)
    document.getElementById('tms-tpl-chips').querySelectorAll('.tms-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const token = '{' + chip.dataset.key + '}';
        const s = ta.selectionStart ?? ta.value.length;
        const e = ta.selectionEnd ?? s;
        ta.value = ta.value.slice(0, s) + token + ta.value.slice(e);
        // 插完把光标放到 token 后面,继续可以接着插下一个
        const pos = s + token.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
        saveTpl();
      });
    });
    document.getElementById('tms-tpl-reset').onclick = () => {
      ta.value = TPL_DEFAULT;
      saveTpl();
      Toast.show('模板已恢复默认', 'ok');
    };

    // ---- [v0.3.43] 宽度区:改为即时生效(去掉"应用"按钮) ----
    // 交互模型(v0.3.42 = 拖滑块 → 数字变 → 点「应用」才生效):
    //   v0.3.43 = 拖滑块 → 数字变 → **页面立刻变** → 自动落盘,没有"应用"这一步。
    // 为什么不等 onchange 再落盘(那才是"最优"的写法):
    //   buildWidthCss() 只从 GM 读值,没有"临时值"通道 —— 要做到"拖动中实时但不落盘",
    //   得给 buildWidthCss 加一个 override 参数,把「从哪取值」这条链整个改一遍。
    //   权衡:GM_setValue 在 Tampermonkey 里是**同步内存写 + 异步刷盘**,
    //   拖动中每帧调一次实测无卡顿(v0.3.42 的问题不是 GM 慢,是"要等点按钮")。
    //   → 选实测更简单可靠的这条路,并把理由写在这里,免得下个会话
    //     看到"每帧写 GM"又来"优化"成 onchange,然后发现要动 buildWidthCss 签名。
    const commitAll = () => {
      GM_setValue(WIDTH_KEYS.fillCenter, document.getElementById('tms-fc').checked);
      GM_setValue(WIDTH_KEYS.hideLeftbar, document.getElementById('tms-hl').checked);
      GM_setValue(WIDTH_KEYS.hideRightbar, document.getElementById('tms-hr').checked);
      applyWidthStyles();
    };
    // 滑块区即时生效:把三个 width 落 GM + 立刻重写 CSS(用户输的数字优先,与滑块同步过)
    const liveApply = () => {
      GM_setValue(WIDTH_KEYS.timeline, parseInt(document.getElementById('tms-tw-num').value, 10) || 1200);
      GM_setValue(WIDTH_KEYS.leftbar, parseInt(document.getElementById('tms-lw-num').value, 10) || 275);
      GM_setValue(WIDTH_KEYS.rightbar, parseInt(document.getElementById('tms-rw-num').value, 10) || 350);
      applyWidthStyles();
    };
    // 自绘 checkbox:隐藏原生 input,用 .on class 驱动样式 —— 点一下立刻生效
    ['tms-fc', 'tms-hl', 'tms-hr'].forEach((id) => {
      const box = document.getElementById(id);
      const lb = document.getElementById(id + '-lb');
      lb.onclick = (e) => {
        e.preventDefault();
        box.checked = !box.checked;
        lb.classList.toggle('on', box.checked);
        commitAll();
      };
    });
    // [v0.3.37] slider ↔ number 双向同步(保留),但把「写值 + 重写 CSS」提前到 oninput
    ['tms-tw', 'tms-lw', 'tms-rw'].forEach((id) => {
      const slider = document.getElementById(id);
      const num = document.getElementById(id + '-num');
      // oninput = 拖动过程中每一帧 → CSS 立即变(视觉实时)
      slider.oninput = () => { num.value = slider.value; liveApply(); };
      // number 直接输:合法就立即生效,非法不拦(等 blur 纠正)
      num.oninput = () => {
        const v = parseInt(num.value, 10);
        const min = parseInt(slider.min, 10);
        const max = parseInt(slider.max, 10);
        if (!isNaN(v) && v >= min && v <= max) { slider.value = v; liveApply(); }
      };
      num.onblur = () => {
        let v = parseInt(num.value, 10);
        const min = parseInt(slider.min, 10);
        const max = parseInt(slider.max, 10);
        if (isNaN(v)) v = parseInt(slider.value, 10);
        else if (v < min) v = min;
        else if (v > max) v = max;
        num.value = v;
        slider.value = v;
        liveApply();
      };
    });
    panel.querySelectorAll('.tms-stp').forEach((btn) => {
      btn.onclick = () => {
        const targetId = btn.dataset.target;
        const step = parseInt(btn.dataset.step, 10);
        const slider = document.getElementById(targetId);
        const num = document.getElementById(targetId + '-num');
        const min = parseInt(slider.min, 10);
        const max = parseInt(slider.max, 10);
        let v = parseInt(slider.value, 10) + step;
        if (v < min) v = min;
        if (v > max) v = max;
        slider.value = v;
        num.value = v;
        liveApply();
      };
    });
  }
    // 悬浮按钮 (用 setTimeout 避开油猴 throw 时机)
    setTimeout(() => {
      if (document.body && !document.getElementById('tms-fab')) {
        const fab = document.createElement('div');
        fab.id = 'tms-fab';
        // [v0.3.43] emoji ⚙️ → SVG 齿轮。emoji 在不同系统/字体下渲染差别大(有的彩色、有的方框),
        //   而且会跟着系统字号缩放;SVG 24x24 + currentColor 才能保证跟其他按钮一致。
        fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
          + '<circle cx="12" cy="12" r="3"/>'
          + '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
          + '</svg>';
        fab.title = 'Twitter 助手设置(可拖动)';
        // [v0.3.40] 外观全部交给 #tms-fab 的 CSS(随主题切换),不再写 inline cssText ——
        //   inline 优先级高于 style 标签,写了就切不了主题色。
        //   ⚠️ 例外:位置(left/top)是**用户拖出来的数据**,必须走 inline 才能定位,
        //   且它不参与配色,不存在"切不了主题"的问题。
        fab.style.userSelect = 'none';
        // [v0.3.43] 位置记忆:GM key tms_fab_pos 存 {x, y}(视口坐标)。
        //   恢复时按**视口比例**算(而不是绝对 px)—— 用户换分辨率/缩放后按钮不会跑到屏幕外。
        const saved = GM_getValue('tms_fab_pos', null);
        const applyPos = () => {
          if (!saved || typeof saved !== 'object') return;
          const fw = 50, fh = 50;
          const x = Math.max(4, Math.min(window.innerWidth - fw - 4, Math.round(saved.x * window.innerWidth - fw / 2)));
          const y = Math.max(4, Math.min(window.innerHeight - fh - 4, Math.round(saved.y * window.innerHeight - fh / 2)));
          fab.style.left = x + 'px';
          fab.style.top = y + 'px';
          fab.style.right = 'auto';
          fab.style.bottom = 'auto';
        };
        applyPos();
        // 拖动:pointer 事件(鼠标 + 触屏一套代码),位移 > 4px 才算拖,否则算点击
        let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
        // [v0.3.43 P1 · jsdom 实跑抓到] 是否"刚拖完"用**布尔标志**而不是时间戳。
        //   原写法:`if (Date.now() - (fab._lastTap || 0) < 350) return;`
        //   真因:pointerup 里"没拖动 → 手动调 onclick()"也会打上时间戳,
        //         紧接着浏览器派发的原生 click 看到 0ms 差值被吞掉(这是本意),
        //         **但下一次真实点击若落在 350ms 内也会被误吞** —— 实测:
        //         关面板(20ms)→ 立刻再点 fab → 面板打不开,差值只有 177ms。
        //         误判方向错了:该吞的只有"同一次手势派生的 click",不是"时间上接近的 click"。
        //   修法:dragging 这个手势里 `moved` 为 false 就说明是点击(直接开面板,
        //         并让随后的原生 click 被吞掉);moved 为 true 说明是拖动
        //         (原生 click 照常触发,靠 `justDragged` 标志吞)。
        let justDragged = false;
        fab.addEventListener('pointerdown', (e) => {
          dragging = true; moved = false; justDragged = false;
          sx = e.clientX; sy = e.clientY;
          const r = fab.getBoundingClientRect();
          ox = r.left; oy = r.top;
          fab.classList.add('dragging');
          try { fab.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器 */ }
        });
        fab.addEventListener('pointermove', (e) => {
          if (!dragging) return;
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;   // 抗抖动
          moved = true;
          const x = Math.max(0, Math.min(window.innerWidth - 50, ox + dx));
          const y = Math.max(0, Math.min(window.innerHeight - 50, oy + dy));
          fab.style.left = x + 'px';
          fab.style.top = y + 'px';
          fab.style.right = 'auto';
          fab.style.bottom = 'auto';
        });
        const endDrag = (e) => {
          if (!dragging) return;
          dragging = false;
          fab.classList.remove('dragging');
          try { fab.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          // [v0.3.43 P0 · 用户实测抓到] 这里**绝对不能**调 showWidthPanel()。
          //   真因:浏览器一次点击会按 pointerdown → pointerup → click 走三步,
          //         pointerup 开了面板,紧接着原生 click 又调一次,
          //         而 showWidthPanel 是**开关**语义(`if (panel) { panel.remove(); return; }`)
          //         → 开完立刻被关掉 → 用户看到"点了没反应"。
          //   为什么静态断言/jsdom 都没抓到:jsdom 里 fab.click() 只派发 click 不派发
          //         pointerup,两条路径没同时触发过 → 断言永远绿。
          //   修法:**开面板只有 click 一条路径**。pointerup 只做"这次是不是拖"的状态记录
          //         + 落盘位置,拖动的话用 justDragged 吞掉随后的 click(防拖完误开面板)。
          justDragged = moved;
          if (!moved) return;
          // 存**中心点的视口比例**(0-1),跨分辨率/缩放都能还原到合理位置
          const r = fab.getBoundingClientRect();
          GM_setValue('tms_fab_pos', {
            x: (r.left + r.width / 2) / window.innerWidth,
            y: (r.top + r.height / 2) / window.innerHeight,
          });
        };
        fab.addEventListener('pointerup', endDrag);
        fab.addEventListener('pointercancel', endDrag);
        fab.onclick = () => {
          // 拖动结束后浏览器会补发一个 click,吞掉它(否则拖完会误开面板)。
          // 吞完立刻清标志 —— 下一次点击无论隔多久都该正常开面板。
          if (justDragged) { justDragged = false; return; }
          showWidthPanel();
        };
        document.body.appendChild(fab);
        console.log(`%c[tms ${TMS_VER}] ✅ ⚙️ 悬浮按钮已添加 (左下角, 可拖动位置自动记忆)`, 'color: #00ff00;');
      }
    }, 1500);
  })();
  