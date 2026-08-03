# 一键安装语音转文字依赖:whisper.cpp 主程序 + small 模型(优先国内镜像)
# 用法: 在仓库根目录运行  powershell -ExecutionPolicy Bypass -File scripts\setup-whisper.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dir = Join-Path $root 'tools\whisper'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# 1) ffmpeg 检查(抽音轨用)
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
  Write-Host '[1/3] ffmpeg 已安装 ✓'
} else {
  Write-Host '[1/3] 缺 ffmpeg!请先运行: winget install -e --id Gyan.FFmpeg  然后重开 PowerShell 再跑本脚本' -ForegroundColor Yellow
}

function Download($urls, $out) {
  foreach ($u in $urls) {
    try {
      Write-Host "  下载 $u"
      Invoke-WebRequest -Uri $u -OutFile $out -UseBasicParsing
      return $true
    } catch {
      Write-Host "  失败,换下一个源…" -ForegroundColor Yellow
    }
  }
  return $false
}

# 2) whisper.cpp Windows 主程序
$exe = @('whisper-cli.exe','main.exe') | ForEach-Object { Join-Path $dir $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($exe) {
  Write-Host '[2/3] whisper.cpp 已存在 ✓'
} else {
  $zip = Join-Path $dir 'whisper.zip'
  $ok = Download @(
    'https://ghproxy.net/https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.4/whisper-bin-x64.zip',
    'https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.4/whisper-bin-x64.zip'
  ) $zip
  if ($ok) {
    Expand-Archive $zip -DestinationPath $dir -Force
    Remove-Item $zip -Force
    Write-Host '[2/3] whisper.cpp 安装完成 ✓'
  } else {
    Write-Host '[2/3] 下载失败。请手动从 github.com/ggml-org/whisper.cpp/releases 下载 whisper-bin-x64.zip,解压到 tools\whisper\' -ForegroundColor Red
  }
}

# 3) 语音模型(small,约 466MB,中文效果好;嫌大可换 ggml-base.bin)
$model = Join-Path $dir 'ggml-small.bin'
if (Test-Path $model) {
  Write-Host '[3/3] 模型已存在 ✓'
} else {
  $ok = Download @(
    'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
  ) $model
  if ($ok) { Write-Host '[3/3] 模型下载完成 ✓' } else {
    Write-Host '[3/3] 模型下载失败。可手动从 hf-mirror.com/ggerganov/whisper.cpp 下载 ggml-small.bin 放到 tools\whisper\' -ForegroundColor Red
  }
}

Write-Host ''
Write-Host '完成!之后「看视频」加 --transcribe(或在 Claude 里说「连语音一起看」)即可转文字。'
