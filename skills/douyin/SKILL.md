---
name: douyin
description: 刷抖音、搜抖音、发抖音。当用户想看抖音热门内容、分析某个关键词下的视频、或者把视频发布到抖音时使用。依赖 Playwright 驱动抖音网页版。
---

# 抖音自动化技能

本插件用 Playwright 操作抖音网页版(douyin.com)和创作者中心(creator.douyin.com),脚本都在 `${CLAUDE_PLUGIN_ROOT}/scripts/` 下。

## 前置条件

- 首次使用先 `cd ${CLAUDE_PLUGIN_ROOT} && npm install`,再运行 `node scripts/login.mjs` 让用户扫码登录(需要有图形界面)。
- 登录态持久化在 `~/.douyin-claude-plugin/user-data`,之后 feed/search 可无头运行。
- 脚本输出都是 JSON,拿到后要整理成人类易读的形式再回复,不要直接贴原始 JSON。

## 能做什么

| 任务 | 命令 |
| --- | --- |
| 刷推荐流 | `node scripts/feed.mjs --count 15` |
| 关键词搜索 | `node scripts/search.mjs --keyword "美食" --count 15` |
| 发视频(存草稿) | `node scripts/post.mjs --video a.mp4 --title "文案 #话题"` |
| 发视频(直接发布) | `node scripts/post.mjs --video a.mp4 --title "文案" --publish` |

## 重要规则

1. **发布必须二次确认**:`--publish` 会把视频公开发到用户的抖音账号。除非用户明确说了要直接发布,否则一律先存草稿,把文案给用户看,确认后再发布。
2. 标题上限 30 字;文案里可以带 `#话题`,建议 1-3 个。
3. 抖音网页版改版可能导致选择器失效。脚本失败时可加 `--headful` 有头运行观察页面,再针对性修 `scripts/` 里的选择器。
4. 抓取结果仅供用户个人浏览和选题分析,不要用于批量爬取或对外分发数据。
5. 遇到「未登录」错误就引导用户运行 `/douyin:login`。
