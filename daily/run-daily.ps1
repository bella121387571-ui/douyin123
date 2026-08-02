# 每日定时运行:让 Claude 执行 daily-prompt.md 里的例行任务
# 配合 Windows 任务计划程序使用,注册命令见 README「给 Claude 一个自己的账号」一节
Set-Location (Split-Path $PSScriptRoot -Parent)
$prompt = Get-Content (Join-Path $PSScriptRoot 'daily-prompt.md') -Raw
claude -p $prompt --allowedTools "Bash(node scripts/*),Read,Write,Edit,Glob,Grep" 2>&1 |
  Tee-Object -FilePath (Join-Path $PSScriptRoot '..\\.douyin-data\\last-run.log')
