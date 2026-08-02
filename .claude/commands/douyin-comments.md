---
description: 看我作品收到的评论(创作者中心)
allowed-tools: Bash
argument-hint: "[数量,默认 30]"
---

运行 `node scripts/comments.mjs --count ${1:-30}`,整理成清单(评论者、内容、点赞、对应作品),总结观众反馈,挑出值得回复的评论。注意向用户说明:这是**收到的**评论,网页版看不了自己发出的评论。
