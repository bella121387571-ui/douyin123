// 清理 .douyin-data 下的临时文件(视频截图、原始响应转储、运行日志)
// 用法: node scripts/cleanup.mjs [--days 1] [--all]
//   --days N  删除 N 天前的文件(默认 1 天)
//   --all     全部删除,不看时间
import fs from 'node:fs';
import path from 'node:path';

function getArg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}
const ALL = process.argv.includes('--all');
const DAYS = parseFloat(getArg('days', '1'));
const maxAgeMs = DAYS * 24 * 3600 * 1000;

const base = path.join(process.cwd(), '.douyin-data');
let removed = 0;
let freedBytes = 0;

function sizeOf(p) {
  try {
    const st = fs.statSync(p);
    if (st.isDirectory())
      return fs.readdirSync(p).reduce((s, n) => s + sizeOf(path.join(p, n)), 0);
    return st.size;
  } catch {
    return 0;
  }
}

// 截图目录:按子目录(每个视频一个)整体清理
const watchDir = path.join(base, 'watch');
if (fs.existsSync(watchDir)) {
  for (const name of fs.readdirSync(watchDir)) {
    const p = path.join(watchDir, name);
    try {
      if (ALL || Date.now() - fs.statSync(p).mtimeMs > maxAgeMs) {
        freedBytes += sizeOf(p);
        fs.rmSync(p, { recursive: true, force: true });
        removed++;
      }
    } catch {
      /* 忽略单个失败 */
    }
  }
}

// 其他临时文件:raw 转储和运行日志
for (const name of ['comments-raw.json', 'mentions-raw.json', 'messages-raw.json', 'last-run.log']) {
  const p = path.join(base, name);
  try {
    if (fs.existsSync(p) && (ALL || Date.now() - fs.statSync(p).mtimeMs > maxAgeMs)) {
      freedBytes += sizeOf(p);
      fs.rmSync(p, { force: true });
      removed++;
    }
  } catch {
    /* 忽略 */
  }
}

console.log(
  JSON.stringify(
    {
      removed_items: removed,
      freed_mb: Math.round((freedBytes / 1024 / 1024) * 10) / 10,
      note: ALL ? '已全部清空' : `已删除 ${DAYS} 天前的临时文件`,
    },
    null,
    2
  )
);
