---
description: 刷抖音推荐流并总结趋势
allowed-tools: Bash
argument-hint: "[数量,默认 10]"
---

运行 `node scripts/feed.mjs --count ${1:-10}`,把 JSON 整理成易读清单(作者、文案一行、点赞/评论、链接),最后总结这波推荐的内容趋势。空结果按脚本提示排查(滑块验证/未登录)。
