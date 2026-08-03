// 语音转文字:ffmpeg 抽音轨 + whisper.cpp 本地识别(全程离线,音频不出本机)
// 依赖安装见 scripts/setup-whisper.ps1;也可单独使用:
//   node scripts/asr.mjs --input 某视频或音频文件
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function canRun(cmd) {
  try {
    const r = spawnSync(cmd, ['--help'], { stdio: 'ignore', timeout: 10000 });
    return !r.error;
  } catch {
    return false;
  }
}

export function findWhisper(root) {
  const candidates = [
    process.env.DOUYIN_WHISPER_CMD,
    path.join(root, 'tools', 'whisper', 'whisper-cli.exe'),
    path.join(root, 'tools', 'whisper', 'main.exe'),
    path.join(root, 'tools', 'whisper', 'whisper-cli'),
    'whisper-cli',
    'whisper-cpp',
  ].filter(Boolean);
  return candidates.find(canRun) || null;
}

export function findFfmpeg(root) {
  const local = [
    process.env.DOUYIN_FFMPEG,
    path.join(root, 'tools', 'ffmpeg', 'ffmpeg.exe'),
    path.join(root, 'tools', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    path.join(root, 'tools', 'ffmpeg', 'ffmpeg'),
  ].filter(Boolean);
  const found = local.find((f) => fs.existsSync(f));
  if (found) return found;
  return canRun('ffmpeg') ? 'ffmpeg' : null;
}

export function findModel(root) {
  const candidates = [
    process.env.DOUYIN_WHISPER_MODEL,
    path.join(root, 'tools', 'whisper', 'ggml-small.bin'),
    path.join(root, 'tools', 'whisper', 'ggml-base.bin'),
  ].filter(Boolean);
  return candidates.find((f) => fs.existsSync(f)) || null;
}

// 返回 { text } 或 { error }
export function transcribeFile(mediaPath, workDir, root = process.cwd()) {
  const ffmpeg = findFfmpeg(root);
  if (!ffmpeg) {
    return { error: '缺少 ffmpeg(抽取音轨用)。运行 scripts\\setup-whisper.ps1 会自动下载便携版,无需 winget。' };
  }
  const wav = path.join(workDir, 'audio.wav');
  const ff = spawnSync(ffmpeg, ['-y', '-i', mediaPath, '-ar', '16000', '-ac', '1', wav], {
    stdio: 'ignore',
    timeout: 60000,
  });
  if (ff.error || !fs.existsSync(wav)) {
    return { error: 'ffmpeg 抽取音轨失败(文件损坏或格式异常)。' };
  }

  const whisper = findWhisper(root);
  if (!whisper) {
    return { error: '没找到 whisper.cpp 主程序。运行 scripts\\setup-whisper.ps1 一键安装,或设置环境变量 DOUYIN_WHISPER_CMD。' };
  }
  const model = findModel(root);
  if (!model) {
    return { error: '没找到语音模型文件(如 tools/whisper/ggml-small.bin)。运行 scripts\\setup-whisper.ps1 下载。' };
  }

  const outPrefix = path.join(workDir, 'transcript');
  const w = spawnSync(
    whisper,
    ['-m', model, '-f', wav, '-l', 'auto', '-otxt', '-of', outPrefix],
    { stdio: 'ignore', timeout: 3 * 60 * 1000 }
  );
  fs.rmSync(wav, { force: true });
  const txtFile = outPrefix + '.txt';
  if (w.error || !fs.existsSync(txtFile)) {
    return { error: '语音识别运行失败(whisper 执行出错或超时)。' };
  }
  const text = fs.readFileSync(txtFile, 'utf8').trim();
  fs.rmSync(txtFile, { force: true });
  return text ? { text } : { error: '识别结果为空(可能视频没有人声)。' };
}

// 命令行直接使用
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const i = process.argv.indexOf('--input');
  const input = i !== -1 ? process.argv[i + 1] : null;
  if (!input || !fs.existsSync(input)) {
    console.error('用法: node scripts/asr.mjs --input 音频或视频文件');
    process.exit(2);
  }
  const r = transcribeFile(input, path.dirname(path.resolve(input)));
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.text ? 0 : 1);
}
