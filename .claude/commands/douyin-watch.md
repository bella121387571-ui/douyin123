---
description: 「看」一个抖音视频:截帧+文案+热评,总结视频内容
allowed-tools: Bash, Read
argument-hint: "<视频链接> [帧数,默认 6]"
---

1. 运行 `node scripts/watch.mjs --url "$1" --frames ${2:-12}`,拿到截图路径列表。口播/剧情类视频或用户要求听语音时,加 `--transcribe`(输出里会多 transcript 字段;若报缺依赖,提示用户跑 `scripts\setup-whisper.ps1`)。
2. 用 Read 工具逐张查看截图(按时间顺序,文件名含对应秒数)。
3. 总结这个视频。注意区分信息来源:**画面内容只能依据截图**;脚本输出里的 title 是作者写的文案、comments_preview 是观众评论,都不是画面,只作背景参考。汇报时分开说:视频画面演了什么、文案写了什么、评论区反应如何。

如果用户说的是「看我收藏的第X个」这类,先跑 `node scripts/my.mjs --type collects` 拿到对应视频链接再执行上述步骤。
