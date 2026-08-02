---
description: 按关键词搜索抖音视频并分析
allowed-tools: Bash
argument-hint: "<关键词> [数量]"
---

运行 `node scripts/search.mjs --keyword "$1" --count ${2:-10}`,结果按点赞从高到低整理成清单,并点评该关键词下哪类内容数据最好,给选题参考。
