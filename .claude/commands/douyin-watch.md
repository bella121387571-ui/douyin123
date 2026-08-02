---
description: 「看」一个抖音视频:截帧+文案+热评,总结视频内容
allowed-tools: Bash, Read
argument-hint: "<视频链接> [帧数,默认 6]"
---

1. 运行 `node scripts/watch.mjs --url "$1" --frames ${2:-6}`,拿到截图路径列表。
2. 用 Read 工具逐张查看截图(它们按时间顺序排列)。
3. 结合画面、文案、热评,总结这个视频:讲了什么、画面/形式是什么样、亮点在哪、评论区反应如何。

如果用户说的是「看我收藏的第X个」这类,先跑 `node scripts/my.mjs --type collects` 拿到对应视频链接再执行上述步骤。
