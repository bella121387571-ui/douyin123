# 抖音助手项目

本项目是抖音自动化工具:用 Playwright 驱动浏览器操作抖音网页版,帮用户刷抖音、搜视频、看主页数据、发视频。

## 可用脚本(在项目根目录运行)

| 任务 | 命令 |
| --- | --- |
| 扫码登录(首次必须) | `node scripts/login.mjs` |
| 刷推荐流 | `node scripts/feed.mjs --count 15` |
| 关键词搜索 | `node scripts/search.mjs --keyword "美食" --count 15` |
| 看用户自己的主页(资料+作品数据) | `node scripts/profile.mjs` |
| 看他人主页 | `node scripts/profile.mjs --url "https://www.douyin.com/user/xxx"` |
| 看我喜欢的视频 | `node scripts/my.mjs --type likes --count 20` |
| 看我收藏的视频 | `node scripts/my.mjs --type collects --count 20` |
| Claude 看某条视频(截帧) | `node scripts/watch.mjs --url "视频链接" [--frames 6]` |
| 看我作品收到的评论 | `node scripts/comments.mjs --count 30` |
| 看私信会话/聊天记录 | `node scripts/messages.mjs [--with "昵称"]` |
| 发私信 | `node scripts/messages.mjs --with "昵称" --send "内容"` |
| 查「@我」的提醒 | `node scripts/mentions.mjs` |
| 在视频下发评论 | `node scripts/reply.mjs --url "视频链接" --text "内容"` |

所有脚本支持 `--profile 名字`(或环境变量 `DOUYIN_PROFILE`)切换到独立登录态,用于 Claude 分身小号等多账号场景;不带则用默认账号。

## Claude 分身账号(每日例行)

`daily/daily-prompt.md` 是给 Claude 小号的每日任务说明(查主人的 @提醒并回评论、回主人私信、刷 10 条视频挑几条推荐给主人),由 `daily/run-daily.ps1` 配合 Windows 任务计划每天自动运行。红线:互动只面向主人,不接触陌生账号,不擅自发布视频。
| 发视频(存草稿) | `node scripts/post.mjs --video 路径.mp4 --title "文案 #话题"` |
| 发视频(直接发布) | 同上加 `--publish` |

## 工作方式

- 用户说「刷抖音 / 看看什么在火」→ 跑 feed 脚本,把 JSON 整理成易读清单(作者、文案、点赞、链接),总结内容趋势。
- 用户说「看我主页 / 分析我的账号」→ 跑 profile 脚本,汇报账号概况(粉丝/获赞/作品数),按点赞排序列作品,分析哪条表现好、给选题建议。
- 用户说「搜XX」→ 跑 search 脚本,按点赞排序,点评哪类内容数据好。
- 用户说「看我喜欢的 / 我收藏的」→ 跑 my 脚本(likes/collects),整理清单,可顺带总结用户兴趣偏好。
- 用户说「帮我看看这条视频 / 看看我收藏的第N条讲什么」→ 先拿到视频链接(收藏场景先跑 my 脚本取链接),再跑 watch 脚本截帧,用 Read 工具逐张看 frames 目录里的图片,结合文案总结视频内容;视频没有字幕语音信息时只根据画面判断,说明这是基于画面的理解。
- 用户说「看我的评论」→ 跑 comments 脚本;注意它抓的是**别人评论我作品**的(网页版没有「我发出的评论」入口,要向用户说明)。可帮用户挑出值得回复的评论、总结观众反馈。
- 用户说「发视频」→ 确认视频路径;没给文案就帮忙写一个(标题≤30字,带1-3个#话题);先跑 post **不带** `--publish`(存草稿),把文案给用户确认;用户明确同意发布后才加 `--publish` 重跑。**未经确认绝不直接发布。**

## 注意事项

- 脚本默认弹出浏览器窗口(抖音风控拦无头浏览器,别加 --headless)。
- 报「未登录」→ 让用户跑 `node scripts/login.mjs` 扫码。
- 抓到 0 条 → 多半是窗口里弹了滑块验证,提醒用户手动完成后重试。
- 首次使用如果缺依赖,先 `npm install`(浏览器用本机 Chrome/Edge,无需 playwright install)。
- 抖音网页改版可能导致选择器失效,可加 `--headful` 观察页面后修 scripts/ 里的选择器。
- 输出别贴原始 JSON,整理成人能读的清单和结论。
