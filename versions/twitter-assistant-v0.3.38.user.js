// ==UserScript==
// @name               Twitter 助手
// @name:zh            Twitter 助手
// @name:en            Twitter Assistant
// @description         油猴脚本,一键下载 Twitter/X 推文里的原图和原视频。文件名 8 占位符命名模板(油猴菜单可改)。右下角 ⚙️ 加宽面板(slider + 数字 input + +/- 10px 步进, 5 个加宽值 + 3 个开关)。
// @description:zh      一键下载 X 推文里的原图和原视频。文件名 8 占位符命名模板(油猴菜单可改):`{user-name}` `{user-id}` `{status-id}` `{date-time[:格式]}` `{date-time-local[:格式]}` `{full-text}` `{file-type}` `{file-name}`。右下角 ⚙️ 加宽面板(时间轴/左栏/右栏宽度可调)。
// @description:en      One-click download of original images and videos from X tweets. Tampermonkey menu → 📝 Filename template → browser prompt with 14 %KEY% placeholders.
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
// @grant                GM_deleteValue
// @match                https://x.com/*
// @match                https://twitter.com/*
// @run-at              document-start
// @version             0.3.38
// @created             2026-10-13
// ==/UserScript==

/* global GM_download, GM_registerMenuCommand, GM_setValue, GM_getValue */
/* jshint esversion: 11 */

(() => {
  'use strict';

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
  const INVALID_CHARS = {
    '\\': '＼', '/': '／', '|': '｜', '<': '＜', '>': '＞',
    ':': '：', '*': '＊', '?': '？', '"': '＂',
    '\u200b': '', '\u200c': '', '\u200d': '', '\u2060': '', '\ufeff': '',
    '🔞': '',
  };
  const clean = (s) => String(s ?? '').split('').map(c => INVALID_CHARS[c] ?? c).join('').trim();

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
  const getTimelineWidth = () => GM_getValue(WIDTH_KEYS.timeline, 1200);  // [v0.3.37] 默认 700→1200 跟 v9.4 一致
  const getLeftbarWidth = () => GM_getValue(WIDTH_KEYS.leftbar, 275);
  const getRightbarWidth = () => GM_getValue(WIDTH_KEYS.rightbar, 350);  // [v0.3.37] 默认 290→350
  const getHideLeftbar = () => GM_getValue(WIDTH_KEYS.hideLeftbar, false);     // v0.3.2 新增
  const getHideRightbar = () => GM_getValue(WIDTH_KEYS.hideRightbar, false);   // v0.3.2 新增
  const getFillCenter = () => GM_getValue(WIDTH_KEYS.fillCenter, false);

  // Styles.apply 复用器(参考 Clean-up §3)
  // key 没变 + <style> 标签还在 → 直接跳过,避免无谓 DOM 操作
  // key 变了 → 重新生成 CSS 文本,移除旧 style 或更新 textContent
  const WidthStyles = {
    state: new Map(),  // id -> { key, empty }
    apply(id, key, build) {
      const prev = this.state.get(id);
      let el = document.getElementById(id);
      if (prev && prev.key === key && (prev.empty || el)) return;
      const css = build();
      this.state.set(id, { key, empty: !css });
      if (!css) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement('style');
        el.id = id;
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = css;
    },
  };

  // 版面宽度 CSS(参考 Clean-up v9.4 §5 buildLayoutCss 完整版)
  // v0.3.6:搬全套 4 个 r-* class 控制(头像/内容/更多按钮的横向 flex 强制)
  // 真因:v0.3.5 只控 primaryColumn,内部 flex 容器 flex-grow:1 顶爆主栏边界
  // 修法:显式 width:100% + flex-grow:1 给中间内容容器(图就在这个容器)

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
    // 3) 对齐参考 line 601:模板含 {file-name} → 不加 -N;多文件 → 加 -N;强制 .ext 结尾
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
    return out;
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
        // [v0.3.38] 先取 mp4; 纯 HLS 视频(只有 application/x-mpegURL)不再被静默丢弃
        let pool = variants.filter((v) => v.content_type === 'video/mp4');
        if (!pool.length) pool = variants.filter((v) => /video\//.test(v.content_type || '') || /\.mp4/i.test(v.url));
        if (!pool.length) return null;
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
    completed: '<g class="tms-c"><path d="M3,14 v5 q0,2 2,2 h14 q2,0 2,-2 v-5 M7,10 l3,4 q1,1 2,0 l8,-11" fill="none" stroke="#1DA1F2" stroke-width="2" stroke-linecap="round" /></g>',
    loading: '<g class="tms-l"><circle cx="12" cy="12" r="10" fill="none" stroke="#1DA1F2" stroke-width="4" opacity="0.4" /><path d="M12,2 a10,10 0 0 1 10,10" fill="none" stroke="#1DA1F2" stroke-width="4" stroke-linecap="round" /></g>',
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

  // ===== 14. 创建下载按钮 =====
  const makeBtn = (onClick) => {
    const btn = document.createElement('div');
    btn.className = 'tms-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;">' + SVG.download + '</svg>';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    setBtn(btn, 'download', '下载媒体');
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    return btn;
  };

  // ===== 15. 下载主流程(每次 getTemplate 实时读) =====
  const onDownload = async (btn, statusId, kind = 'main') => {
    if (btn.classList.contains('tms-l')) return;
    setBtn(btn, 'loading', '正在拉取元数据…');
    let tweet;
    try {
      tweet = await fetchTweet(statusId);
    } catch (e) {
      console.error('[tms] fetchTweet fail', e);
      setBtn(btn, 'failed', '拉取失败: ' + e.message);
      return;
    }
    const legacy = tweet?.legacy || {};
    const user = tweet?.core?.user_results?.result?.legacy || {};
    const medias = parseMedias(legacy);
    if (!medias.length) {
      setBtn(btn, 'failed', '这条推文没有媒体');
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
    for (let i = 0; i < medias.length; i++) {
      const m = medias[i];
      const idx = medias.length > 1 ? (i + 1) : 0;
      const filename = renderTemplate(tpl, { ...info, index: idx }, m);
      setBtn(btn, 'loading', `下载 ${i + 1}/${medias.length}: ${filename}`);
      await downloadOne(btn, m.url, filename, m.raw);
    }
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
        for (let i = 0; i < qMedias.length; i++) {
          const m = qMedias[i];
          const idx = qMedias.length > 1 ? (i + 1) : 0;
          const filename = renderTemplate(tpl, { ...qInfo, index: idx }, m)
                            .replace(/(\.[^.]+)$/, '-quoted$1');
          setBtn(btn, 'loading', `引用 ${i + 1}/${qMedias.length}: ${filename}`);
          await downloadOne(btn, m.url, filename, m.raw);
        }
      }
    }
    setBtn(btn, 'completed', `已下载 ${medias.length} 项媒体`);
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
  const CSS = `
.tms-btn {margin-left: 12px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; opacity: 0.9;}
/* v0.1.7:克隆 wrapper 居中 — 强制 inner button 垂直水平居中,消除细微 baseline 错位 */
/* v0.1.8:translateY(-1.5px) 不够,改 -3px (用户拍板) */
.tms-down {display: inline-flex !important; align-items: center !important; justify-content: center !important; min-height: 1.5em; min-width: 1.5em; transform: translateY(-3px);}
.tms-down > * {display: flex !important; align-items: center !important; justify-content: center !important;}
/* v0.1.4:克隆 X 自带按钮结构后,wrap 也加 tms-down class 走同组状态 class(支持 tms-down 跟 tms-btn 两路径)*/
.tms-btn.tms-overlay {position: absolute; right: 8px; bottom: 8px; padding: 6px; border-radius: 99px; background: rgba(255,255,255,0.7);}
.tms-btn.tms-overlay > svg {color: #fff; filter: drop-shadow(0 0 1px #000);}
.tms-btn.tms-overlay:hover {background: rgba(29,161,242,0.7);}
/* v0.1.5:CSS 默认让 tms-d g 显示(因为 .tms-down g {display:none} 会让 download 状态也隐藏)
  状态 class(下载/完成/加载/失败)— 同时支持 .tms-btn(自创) 和 .tms-down(克隆) */
.tms-btn g:not(.tms-d):not(.tms-c):not(.tms-l):not(.tms-f), .tms-down g:not(.tms-d):not(.tms-c):not(.tms-l):not(.tms-f) {display: none;}
/* 切到 c/l/f 状态时,显示对应 g(用 > 选择子元素) */
.tms-btn.tms-d > svg > g.tms-d, .tms-btn.tms-c > svg > g.tms-c, .tms-btn.tms-l > svg > g.tms-l, .tms-btn.tms-f > svg > g.tms-f,
.tms-down.tms-d > svg > g.tms-d, .tms-down.tms-c > svg > g.tms-c, .tms-down.tms-l > svg > g.tms-l, .tms-down.tms-f > svg > g.tms-f {display: unset;}
/* v0.1.5 修法:download 状态用 .tms-d 类显式显示,避免跟 X 自带 svg 的 g 冲突 */
.tms-down:not(.tms-c):not(.tms-l):not(.tms-f) > svg > g.tms-d {display: unset;}
/* loading 旋转动画(对齐参考 tmd-down.loading) */
.tms-btn.tms-l > svg, .tms-down.tms-l > svg {animation: tms-spin 1s linear infinite;}
@keyframes tms-spin {0% {transform: rotate(0deg);} 100% {transform: rotate(360deg);}}
`.replace(/\s+/g, ' ').trim();

  // ===== 20. 油猴菜单(对齐 IG Saver line 1782-1796 思路) =====
  // 用 window.prompt + 多行 help,IG 风格稳定简洁
  const HELP_TEXT =
`当前模板(可改):

{user-name}(@{user-id})_{date-time}_{status-id}_{file-type}

可用占位符(对齐参考 goemon2017 87KB line 854-860,8 个 {key} 小写):

作者/内容:
  {user-name}     作者昵称
  {user-id}       @ screen_name
  {status-id}     推文 ID
  {full-text}     推文正文(清洗 t.co,首行,60 字)

时间(UTC):
  {date-time}     YYYYMMDD-hhmmss(默认)
  {date-time:格式}  自定义格式(参考 line 539 注释:DD-MMM-YY hh.mm → 13-OCT-26 08.15)

时间(本地):
  {date-time-local}            YYYYMMDD-hhmmss(本机时区)
  {date-time-local:格式}       自定义格式

时间格式 token(用于 {date-time:格式}):
  YYYY YY MMM MM DD hh mm ss h2 ap

媒体:
  {file-type}     photo / video / gif
  {file-name}     原 URL 末段 stem(参考 line 860 注:"Original filename from URL")

规则(对齐参考 line 601):
  - 模板不含 .ext(jpg/mp4):自动加
  - 模板不含 {file-name} 且多文件:自动加 -1 -2 -3 后缀
  - 引用推文:文件名末尾加 -quoted

示例:
  {user-name}(@{user-id})_{date-time}_{full-text}_{file-type}
  {user-id}/{date-time-local:YYYY-MM-DD}/{status-id}_{file-type}
  {user-name}(@{user-id})_{date-time:DD-MMM-YY hh.mm}_{status-id}_{file-type}`;

  GM_registerMenuCommand('📝 设置命名模板', () => {
    const cur = getTemplate();
    const next = window.prompt(HELP_TEXT, cur);
    if (next && next.trim()) {
      setTemplate(next.trim());
      console.log(`[tms v0.3.38] 模板已更新: ${next.trim()}`);
    }
  });

  GM_registerMenuCommand('🔄 重置模板', () => {
    setTemplate(TPL_DEFAULT);
    console.log(`[tms v0.3.38] 模板已重置: ${TPL_DEFAULT}`);
  });

  // ===== 21. 启动 =====
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) detect(n);
      });
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('article, li[role="listitem"]').forEach(detect);

  // ---- G. (v0.3.0 新增) 面板宽度 ----
  // [v0.3.37] 加宽 UI 面板 (不用 GM_registerMenuCommand, 油猴 sandbox throw "invalid name")
  // 修法: 改用 GM_getValue/GM_setValue 读值, 写值, 改完调 applyWidthStyles 重写 CSS
  // UI 用一个悬浮按钮 + 姐姐自己写的 HTML 面板 (不经过油猴 wrapper 验证)
  function buildWidthCss() {
    // [v0.3.37] 调 GM_getValue 读, 用户在 UI 面板里改
    const tw = getTimelineWidth();
    const lw = getLeftbarWidth();
    const rw = getRightbarWidth();
    const fc = getFillCenter();
    const hl = getHideLeftbar();
    const hr = getHideRightbar();
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
        header[role="banner"] > div:first-child,
        header[role="banner"] .r-o96wvk,
        .r-o96wvk {
          width: ${lw}px !important;
        }
        main div[data-testid="primaryColumn"],
        main section[role="region"] > div {
          width: 100% !important;
          max-width: none !important;
        }
      `;
    }
    const target = `${tw}px`;
    const primary = 'main div[data-testid="primaryColumn"]';
    return `
      main[role="main"],
      main.css-175oi2r {
        width: 100% !important;
        max-width: none !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      header[role="banner"] > div:first-child,
      header[role="banner"] .r-o96wvk,
      .r-o96wvk {
        width: ${lw}px !important;
      }
      ${primary},
      main section[role="region"] > div,
      main .r-1ye8kvj {
        width: ${target} !important;
        max-width: none !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
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
  function applyWidthStyles() {
    let el = document.getElementById('tm-timeline-inner-lock');
    if (!el) {
      el = document.createElement('style');
      el.id = 'tm-timeline-inner-lock';
      (document.head || document.documentElement).appendChild(el);
      console.log('%c[tms v0.3.38] ✅ style 标签已创建', 'color: #00ff00;');
    } else {
      console.log('%c[tms v0.3.38] ♻️ style 标签已存在', 'color: #00ffff;');
    }
    el.textContent = buildWidthCss();
    console.log('%c[tms v0.3.38] CSS 已写入, length=' + el.textContent.length, 'color: #00ff00;');
  }
  // [v0.3.37] 启动调一次 (跟 v9.4 line 819 一样) — 不用 setTimeout 不用 MutationObserver
  if (document.body) {
    applyWidthStyles();
  } else {
    document.addEventListener('DOMContentLoaded', () => applyWidthStyles());
  }

  console.log(`%c[tms v0.3.38 ✅ INSTALLED v0.3.38] loaded — Twitter Media Saver ready. 下载: 原生格式 + name=orig (v0.3.38 修复 PNG 原图 404, X 不支持服务端转码) | 加宽面板: ⚙️ 右下角 (slider + 数字 input + +/- 10px 步进) | 当前模板: ${getTemplate()}` +
    '', 'color: #00ff00; font-weight: bold; font-size: 14px;');

  // [v0.3.37] 关键 — 加宽 UI 面板 (用姐姐自己写的 HTML, 不调 GM_registerMenuCommand)
  // 真因: 5 个加宽菜单的 callback 闭包引用 page script 函数 → 油猴 wrapper 验证 → throw "invalid name"
  // 修法: 油猴 0 加宽菜单, 改用 1 个悬浮按钮 + 姐姐自己写的 HTML 面板 (不经过油猴 wrapper 验证)
  function showWidthPanel() {
    let panel = document.getElementById('tms-width-panel');
    if (panel) { panel.remove(); return; }
    panel = document.createElement('div');
    panel.id = 'tms-width-panel';
    panel.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;background:#1a1a2e;color:#eee;padding:16px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.4);font:13px/1.5 -apple-system,sans-serif;width:300px;';
    // [v0.3.37] sliders 辅助函数 — slider + 数字 input + +/- 步进按钮 (用户能直接输入数字)
    const sliders = (id, label, min, max, val) => `
      <div style="margin:6px 0;display:flex;align-items:center;gap:6px">
        <span style="flex:0 0 50px">${label}</span>
        <input type="number" min="${min}" max="${max}" value="${val}" id="${id}-num" style="width:60px;padding:2px 4px;background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;font:12px monospace">
        <span style="color:#888;font-size:11px">px</span>
        <input type="range" min="${min}" max="${max}" value="${val}" id="${id}" style="flex:1">
        <button class="tms-minus" data-target="${id}" data-step="-10" style="width:24px;height:24px;background:#334155;color:#fff;border:none;border-radius:4px;cursor:pointer">-</button>
        <button class="tms-plus" data-target="${id}" data-step="10" style="width:24px;height:24px;background:#334155;color:#fff;border:none;border-radius:4px;cursor:pointer">+</button>
      </div>
    `;
    const slider = (key, min, max, label) => `<input type="range" min="${min}" max="${max}" value="${GM_getValue(WIDTH_KEYS[key], label==='时间轴'?1200:label==='左栏'?275:350)}" style="width:140px" oninput="this.nextElementSibling.textContent=this.value+'px';window.__tms_ui_pending=this.value;window.__tms_ui_key='${key}';window.__tms_ui_min=${min};window.__tms_ui_max=${max}">`;
    const cb = (key, label) => `<label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" ${GM_getValue(WIDTH_KEYS[key],false)?'checked':''} onchange="window.__tms_ui_cb_pending=this.checked;window.__tms_ui_cb_key='${key}';window.__tms_ui_cb_label='${label}'">${label}</label>`;
    const tw = GM_getValue(WIDTH_KEYS.timeline, 1200);
    const lw = GM_getValue(WIDTH_KEYS.leftbar, 275);
    const rw = GM_getValue(WIDTH_KEYS.rightbar, 350);
    const fc = GM_getValue(WIDTH_KEYS.fillCenter, false);
    const hl = GM_getValue(WIDTH_KEYS.hideLeftbar, false);
    const hr = GM_getValue(WIDTH_KEYS.hideRightbar, false);
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <strong style="color:#fff">⚙️ Twitter 助手加宽</strong>
        <span id="tms-panel-close" style="cursor:pointer;padding:0 6px;color:#999">✕</span>
      </div>
      <div style="font-size:11px;color:#888;margin-bottom:6px">拖动 slider 或点数字直接输入, 点 +/- 步进 10px</div>
      ${sliders('tms-tw', '时间轴', 500, 1800, tw)}
      ${sliders('tms-lw', '左栏', 200, 400, lw)}
      ${sliders('tms-rw', '右栏', 200, 400, rw)}
      <div style="margin:8px 0;border-top:1px solid #333;padding-top:8px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input id="tms-fc" type="checkbox" ${fc?'checked':''}>
          <span>中间填满 (改主栏宽为 100%)</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:4px">
          <input id="tms-hl" type="checkbox" ${hl?'checked':''}>
          <span>隐藏左栏</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:4px">
          <input id="tms-hr" type="checkbox" ${hr?'checked':''}>
          <span>隐藏右栏</span>
        </label>
      </div>
      <button id="tms-apply" style="width:100%;padding:8px;margin-top:8px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold">应用</button>
      <div style="margin-top:6px;font-size:11px;color:#888;text-align:center">点击 ⚙️ 按钮可重新打开</div>
    `;
    document.body.appendChild(panel);
    // 关闭
    document.getElementById('tms-panel-close').onclick = () => panel.remove();
    // [v0.3.37] 4 个事件: slider ↔ number 双向同步, +/- 步进, 关闭按钮
    ['tms-tw', 'tms-lw', 'tms-rw'].forEach(id => {
      const slider = document.getElementById(id);
      const num = document.getElementById(id + '-num');
      // slider 拖动 → 同步 number input
      slider.oninput = () => { num.value = slider.value; };
      // number input 输入 → 同步 slider (验证 min/max)
      num.oninput = () => {
        const v = parseInt(num.value, 10);
        const min = parseInt(slider.min, 10);
        const max = parseInt(slider.max, 10);
        if (!isNaN(v) && v >= min && v <= max) slider.value = v;
      };
      // number input blur → 强制修正 (超出范围改回 min/max)
      num.onblur = () => {
        let v = parseInt(num.value, 10);
        const min = parseInt(slider.min, 10);
        const max = parseInt(slider.max, 10);
        if (isNaN(v)) v = parseInt(slider.value, 10);
        else if (v < min) v = min;
        else if (v > max) v = max;
        num.value = v;
        slider.value = v;
      };
    });
    // +/- 步进按钮
    document.querySelectorAll('.tms-minus, .tms-plus').forEach(btn => {
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
      };
    });
    // 应用按钮 (读 number input, 不是 slider — 用户直接输的数会优先)
    document.getElementById('tms-apply').onclick = () => {
      const tw = parseInt(document.getElementById('tms-tw-num').value, 10);
      const lw = parseInt(document.getElementById('tms-lw-num').value, 10);
      const rw = parseInt(document.getElementById('tms-rw-num').value, 10);
      const fc = document.getElementById('tms-fc').checked;
      const hl = document.getElementById('tms-hl').checked;
      const hr = document.getElementById('tms-hr').checked;
      GM_setValue(WIDTH_KEYS.timeline, tw);
      GM_setValue(WIDTH_KEYS.leftbar, lw);
      GM_setValue(WIDTH_KEYS.rightbar, rw);
      GM_setValue(WIDTH_KEYS.fillCenter, fc);
      GM_setValue(WIDTH_KEYS.hideLeftbar, hl);
      GM_setValue(WIDTH_KEYS.hideRightbar, hr);
      applyWidthStyles();
      console.log(`%c[tms v0.3.38] ✅ 已应用: 时间轴=${tw}px 左栏=${lw}px 右栏=${rw}px 填满=${fc} 隐藏左=${hl} 隐藏右=${hr}`, 'color: #00ff00;');
      panel.remove();
    };
  }
  // 悬浮按钮 (用 setTimeout 避开油猴 throw 时机)
  setTimeout(() => {
    if (document.body && !document.getElementById('tms-fab')) {
      const fab = document.createElement('div');
      fab.id = 'tms-fab';
      fab.textContent = '⚙️';
      fab.title = 'Twitter 助手加宽面板';
      fab.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999998;width:48px;height:48px;border-radius:50%;background:#3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:24px;box-shadow:0 4px 12px rgba(0,0,0,.3);user-select:none;';
      fab.onclick = showWidthPanel;
      document.body.appendChild(fab);
      console.log('%c[tms v0.3.38] ✅ ⚙️ 悬浮按钮已添加 (右下角, 点开加宽面板)', 'color: #00ff00;');
    }
  }, 1500);
})();
