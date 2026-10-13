# Greasy Fork 上架描述 (Twitter 助手 v0.3.37)

> 复制下面 4 个字段到 Greasy Fork 提交表单.

---

## 1. Script Name (油猴脚本名)

```
Twitter 助手 (Twitter Assistant)
```

---

## 2. Description (简短, 1-2 句, 搜索结果展示)

```
一键下载 Twitter/X 推文里的原图和原视频 (强制 jpg 格式), 8 占位符命名模板, 右下角 ⚙️ 加宽布局面板.
```

---

## 3. 详细描述 (Markdown, 页面内展示, 可长)

````markdown
## 这是什么

油猴脚本 (Tampermonkey / ScriptCat / Greasemonkey), 装在 X.com (Twitter) 上, 提供两个核心功能:

1. **下载推文原图原视频** — 推文工具栏加下载按钮, 点一下下载推文所有图/视频到本地
2. **加宽布局** — 页面右下角 ⚙️ 悬浮按钮, 点开调时间轴/左栏/右栏宽度

## 截图演示

- 推文工具栏多 1 个下载按钮 (🖼️ / 🎬 图标)
- 页面右下角悬浮 ⚙️ 按钮 (蓝色圆圈, 1.5 秒后出现)
- 点 ⚙️ 弹设置面板: 时间轴 / 左栏 / 右栏 slider + 数字 input + +/- 10px 步进
- 5 个加宽值 + 3 个开关: 中间填满 / 隐藏左栏 / 隐藏右栏

## 下载功能

**操作**: 任意图片/视频推文, 工具栏点 🖼️ (图) / 🎬 (视频) 按钮.

**下载文件**:
- **图**: X 服务端 `name=orig` 档 (X 最大尺寸) + `format=jpg` 强制 jpg 编码
- **视频**: 取 `video_info.variants` 里 `bitrate` 最高的 mp4
- **文件名**: `{user-name}(@{user-id})_{date-time}_{status-id}_{file-type}.jpg` (默认模板, 可改)
- **存放**: 浏览器默认下载目录

**8 个占位符** (可改):
- `{user-name}` 用户昵称
- `{user-id}` 用户 screen_name
- `{status-id}` 推文 ID
- `{date-time}` UTC 时间 YYYYMMDD-hhmmss
- `{date-time-local}` 本地时区
- `{date-time:格式}` 自定义格式
- `{full-text}` 推文文本
- `{file-type}` photo / video / gif

**2 个油猴菜单**:
- 📝 设置命名模板
- 🔄 重置模板

## 加宽布局

**操作**: 右下角 ⚙️ → 弹设置面板

**5 个加宽值 + 3 个开关**:
- 时间轴宽度 (500-1800px)
- 左栏宽度 (200-400px)
- 右栏宽度 (200-400px)
- 中间填满 (主栏 100%)
- 隐藏左栏
- 隐藏右栏

**3 种操作任选**:
- 拖动 slider
- 点数字 input 直接输入
- 点 +/- 步进 10px

**应用** → 立即重写 CSS + 关闭面板

**跨刷新保留**: 本地存储, 下次打开 X.com 自动恢复

## 性能指标 (v0.3.37 实测真值)

| 指标 | 真值 |
|---|---|
| 下载 = X 最大尺寸 | ✓ (`name=orig` 档, 跟 `name=large` 等价或更大) |
| 文件格式 | jpg (字节 + 扩展名 + content-type 三位一致) |
| content-type | `image/jpeg` |
| 文件头魔数 | `ffd8ffe0` (JFIF JPEG 标准) |
| 主页缩略图 | 0 张 (`name=thumb` / `name=small` 都没出现) |
| 加载时间 | 1.5 秒后 ⚙️ 按钮出现 |

## 安装

1. 装 [Tampermonkey](https://www.tampermonkey.net/) (或 ScriptCat / Violentmonkey)
2. 装本脚本 (点 Greasy Fork 页面右上 "Install" 按钮)
3. 打开 https://x.com, DevTools Console 应出现 `INSTALLED v0.3.37`
4. 1.5 秒后右下角出现 ⚙️ 按钮 = 装成功

## 兼容

- ✅ Chrome / Edge (Chromium 系)
- ✅ Firefox
- ⚠️ Safari (Tampermonkey 兼容, 偶发 X 改版后)
- ❌ X.com mobile.twitter.com (不兼容, 仅支持主站)

## 已知限制

- 仅支持 X.com (Twitter.com), 不支持 mobile.twitter.com / 旧版界面
- X 改版后某些浏览器 adblock 可能拦截 graphql API
- 4K 视频浏览器分段下载, 油猴 `GM_download` 一次只能下 1 段

## 反馈

- GitHub: https://github.com/teddy4556/twitter-assistant
- 油猴菜单 → 📝 设置命名模板 (任何反馈可改)

## License

MIT
````

---

## 4. 标签 (Tags, Greasy Fork 逗号分隔)

```
twitter, x, media-download, image-download, video-download, wide-layout, userscript
```

---

## 5. 必填的 @metadata 字段 (上传 .user.js 后自动填, 但确认下)

```
@name:           Twitter 助手
@name:en:        Twitter Assistant
@description:    油猴脚本,一键下载 Twitter/X 推文里的原图和原视频。文件名 8 占位符命名模板(油猴菜单可改)。右下角 ⚙️ 加宽面板(slider + 数字 input + +/- 10px 步进, 5 个加宽值 + 3 个开关)。
@namespace:      https://github.com/teddy4556/twitter-assistant
@version:        0.3.37
@license:        MIT
@match:          https://x.com/*
@match:          https://twitter.com/*
@grant:          GM_download, GM_registerMenuCommand, GM_setValue, GM_getValue, GM_deleteValue
@run-at:         document-start
```

---

## 6. 上架 5 步

1. 注册/登录 https://greasyfork.org (GitHub OAuth 登录)
2. 点右上 "Add a script" → 选 "Upload from file"
3. 上传 `twitter-assistant-v0.3.37.user.js` (本仓库 `versions/`)
4. 填上面 4 个字段 (Name / Description / 详细描述 / Tags), 改 @namespace / @homepageURL 到你的 GitHub
5. 提交审核 (1-3 天通过)

---

## 7. 后续更新流程 (v0.3.38+)

1. 在 GitHub commit + push 新版 (本仓库有完整 git 历史)
2. Greasy Fork 你的脚本页 → "Update" → 上传新 .user.js
3. Greasy Fork 保留旧版本历史 (用户能 roll back)
