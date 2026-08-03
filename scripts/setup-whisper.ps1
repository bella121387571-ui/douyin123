# 一键安装语音转文字依赖:ffmpeg(便携版)+ whisper.cpp 主程序 + small 模型
# 全部下载到仓库的 tools\ 目录,不需要 winget/管理员权限;优先国内可达的源。
# 用法: 在仓库根目录运行  powershell -ExecutionPolicy Bypass -File scripts\setup-whisper.ps1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path $PSScriptRoot -Parent
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'

# 优先用系统自带的 curl.exe(Win10 1803+ 都有,比 Invoke-WebRequest 稳),没有再用 IWR
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
function Download($urls, $out) {
  foreach ($u in $urls) {
    try {
      Write-Host "  下载 $u"
      if ($curl) {
        & $curl.Source -L --fail -o $out --connect-timeout 25 -A $UA $u
        if ($LASTEXITCODE -eq 0 -and (Test-Path $out) -and ((Get-Item $out).Length -gt 10000)) { return $true }
        Remove-Item $out -Force -ErrorAction SilentlyContinue
        throw "curl 失败"
      } else {
        Invoke-WebRequest -Uri $u -OutFile $out -UseBasicParsing -UserAgent $UA
        if ((Test-Path $out) -and ((Get-Item $out).Length -gt 10000)) { return $true }
        throw "文件太小"
      }
    } catch {
      Write-Host "  失败,换下一个源…" -ForegroundColor Yellow
      Remove-Item $out -Force -ErrorAction SilentlyContinue
    }
  }
  return $false
}

# 1) ffmpeg(抽音轨用):系统装过就用系统的,否则下载便携版到 tools\ffmpeg
$ffdir = Join-Path $root 'tools\ffmpeg'
$ffexe = Join-Path $ffdir 'ffmpeg.exe'
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
  Write-Host '[1/3] ffmpeg 已安装(系统)✓'
} elseif (Test-Path $ffexe) {
  Write-Host '[1/3] ffmpeg(便携版)已存在 ✓'
} else {
  New-Item -ItemType Directory -Force -Path $ffdir | Out-Null
  $zip = Join-Path $ffdir 'ffmpeg.zip'
  $ok = Download @(
    'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
    'https://ghfast.top/https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip',
    'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip'
  ) $zip
  if ($ok) {
    Expand-Archive $zip -DestinationPath $ffdir -Force
    $found = Get-ChildItem $ffdir -Recurse -Filter ffmpeg.exe | Where-Object { $_.FullName -ne $ffexe } | Select-Object -First 1
    if ($found) { Copy-Item $found.FullName $ffexe -Force }
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Get-ChildItem $ffdir -Directory | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $ffexe) { Write-Host '[1/3] ffmpeg 便携版下载完成 ✓' }
    else { Write-Host '[1/3] 解压后没找到 ffmpeg.exe,请手动下载解压并把 ffmpeg.exe 放到 tools\ffmpeg\' -ForegroundColor Red }
  } else {
    Write-Host '[1/3] ffmpeg 下载失败。手动下载 https://www.gyan.dev/ffmpeg/builds/ 的 essentials 包,把 bin\ffmpeg.exe 放到 tools\ffmpeg\' -ForegroundColor Red
  }
}

# 2) whisper.cpp Windows 主程序(v1.5.4 是最后一个官方带 Windows 编译包的版本,
#    可正常使用 ggml 模型;更高版本官方不再发 Windows 包)
$dir = Join-Path $root 'tools\whisper'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$exe = @('whisper-cli.exe','main.exe') | ForEach-Object { Join-Path $dir $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($exe) {
  Write-Host '[2/3] whisper.cpp 已存在 ✓'
} else {
  $zip = Join-Path $dir 'whisper.zip'
  $ok = Download @(
    'https://ghfast.top/https://github.com/ggml-org/whisper.cpp/releases/download/v1.5.4/whisper-bin-x64.zip',
    'https://gh-proxy.com/https://github.com/ggml-org/whisper.cpp/releases/download/v1.5.4/whisper-bin-x64.zip',
    'https://github.com/ggml-org/whisper.cpp/releases/download/v1.5.4/whisper-bin-x64.zip'
  ) $zip
  if ($ok) {
    Expand-Archive $zip -DestinationPath $dir -Force
    Remove-Item $zip -Force
    Write-Host '[2/3] whisper.cpp 安装完成 ✓'
  } else {
    Write-Host '[2/3] 下载失败。请手动下载(浏览器打开):' -ForegroundColor Red
    Write-Host '     https://github.com/ggml-org/whisper.cpp/releases/download/v1.5.4/whisper-bin-x64.zip' -ForegroundColor Red
    Write-Host '     解压后把里面的文件放到 tools\whisper\' -ForegroundColor Red
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
    Write-Host '[3/3] 模型下载失败。请手动下载(浏览器打开):' -ForegroundColor Red
    Write-Host '     https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' -ForegroundColor Red
    Write-Host '     下载完把 ggml-small.bin 放到 tools\whisper\' -ForegroundColor Red
  }
}

Write-Host ''
Write-Host '完成!之后「看视频」加 --transcribe(或在 Claude 里说「连语音一起看」)即可转文字。'
