// 「看」抖音内容:视频帖按时间顺序截帧,图文帖下载每张图片,并抓取文案和热评。
// 产物存到 .douyin-data/watch/ 下,供 Claude 读图理解内容。
// 用法: node scripts/watch.mjs --url "https://www.douyin.com/video/xxx" [--frames 12] [--transcribe]
import fs from 'node:fs';
import path from 'node:path';
import { launch, getArg, hasFlag } from './lib.mjs';

const url = getArg('url');
if (!url) {
  console.error('用法: node scripts/watch.mjs --url "视频或图文链接" [--frames 12] [--transcribe]');
  process.exit(2);
}
const FRAMES = Math.min(parseInt(getArg('frames', '12'), 10), 24);
const INTERVAL = parseFloat(getArg('interval', '2'));
const TRANSCRIBE = hasFlag('transcribe'); // 语音转文字(需 ffmpeg + whisper,见 setup-whisper.ps1)
const MAX_IMAGES = Math.max(FRAMES, 12); // 图文帖最多取多少张图

const context = await launch({ headless: hasFlag('headless') });
const page = context.pages()[0] || (await context.newPage());

// 从详情接口里拿:视频播放地址(转写用)、背景音乐地址、图文帖的图片地址
let playUrl = null;
let musicUrl = null;
let apiImages = [];
page.on('response', async (res) => {
  if (!/\/aweme\/v1\/web\/aweme\/detail\//.test(res.url())) return;
  try {
    const d = await res.json();
    const detail = d?.aweme_detail;
    const pick = (list) => (list || []).find((u) => u.startsWith('https')) || (list || [])[0] || null;
    playUrl = pick(detail?.video?.play_addr?.url_list) || playUrl;
    musicUrl = pick(detail?.music?.play_url?.url_list) || musicUrl;
    if (Array.isArray(detail?.images) && detail.images.length) {
      apiImages = detail.images.map((im) => pick(im?.url_list)).filter(Boolean);
    }
  } catch {
    /* 忽略非 JSON */
  }
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

// 顺手清理 24 小时前的旧产物,防止磁盘堆积(独立清理见 scripts/cleanup.mjs)
const watchBase = path.join(process.cwd(), '.douyin-data', 'watch');
try {
  for (const name of fs.readdirSync(watchBase)) {
    const p = path.join(watchBase, name);
    if (Date.now() - fs.statSync(p).mtimeMs > 24 * 3600 * 1000) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
} catch {
  /* 目录不存在等情况,忽略 */
}

const id = (url.match(/(?:video|note|slides)\/(\d+)/) || [])[1] || String(Date.now());
const dir = path.join(watchBase, id);
fs.mkdirSync(dir, { recursive: true });

const video = page.locator('video').first();
const hasVideo = (await video.count()) > 0;
const mediaType = hasVideo ? 'video' : 'images';
const framePaths = [];

async function saveRemote(fileUrl, file) {
  try {
    const resp = await context.request.get(fileUrl, {
      headers: { referer: 'https://www.douyin.com/' },
      timeout: 30000,
    });
    if (!resp.ok()) return false;
    fs.writeFileSync(file, await resp.body());
    return true;
  } catch {
    return false;
  }
}

if (hasVideo) {
  // ===== 视频帖:在整条时长上均匀取点截帧 =====

  // 等视频真正可播(拿到时长和画面尺寸),顺便静音
  let meta = null;
  try {
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video');
        return v && v.duration > 0 && v.videoWidth > 0;
      },
      { timeout: 30000 }
    );
    meta = await page.evaluate(() => {
      const v = document.querySelector('video');
      v.muted = true;
      return { duration: v.duration };
    });
  } catch {
    /* 拿不到元数据就走实时播放兜底 */
  }

  // 用 canvas 抓当前解码帧(元素截图容易截到封面/黑屏,canvas 拿的是真实画面)
  const captureFrame = async (file) => {
    const dataUrl = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || v.videoWidth === 0) return null;
      const c = document.createElement('canvas');
      const scale = Math.min(1, 960 / v.videoWidth);
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      try {
        return c.toDataURL('image/jpeg', 0.85);
      } catch {
        return null; // 跨域污染等情况,退回元素截图
      }
    });
    if (dataUrl && dataUrl.startsWith('data:image/jpeg')) {
      fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
      return true;
    }
    try {
      await video.screenshot({ path: file });
      return true;
    } catch {
      return false;
    }
  };

  if (meta) {
    for (let i = 0; i < FRAMES; i++) {
      const t = (meta.duration * (i + 0.5)) / FRAMES;
      await page.evaluate(async (t) => {
        const v = document.querySelector('video');
        v.muted = true;
        v.currentTime = t;
        await new Promise((r) => {
          const done = () => {
            v.removeEventListener('seeked', done);
            r();
          };
          v.addEventListener('seeked', done);
          setTimeout(done, 3000);
        });
        // 播一小段,确保画面已解码
        await v.play().catch(() => {});
        await new Promise((r) => setTimeout(r, 200));
        v.pause();
      }, t);
      const file = path.join(dir, `frame-${String(i + 1).padStart(2, '0')}-第${Math.round(t)}秒.jpg`);
      if (await captureFrame(file)) framePaths.push(file);
    }
  } else {
    // 拿不到时长的特殊播放器:退回实时播放截帧
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) {
        v.muted = true;
        v.play().catch(() => {});
      }
    });
    for (let i = 0; i < FRAMES; i++) {
      const file = path.join(dir, `frame-${String(i + 1).padStart(2, '0')}.jpg`);
      if (await captureFrame(file)) framePaths.push(file);
      await page.waitForTimeout(INTERVAL * 1000);
    }
  }
} else {
  // ===== 图文帖(图片合集):把每张图片下载下来 =====
  let imageUrls = apiImages;
  if (imageUrls.length === 0) {
    // 详情接口没抓到就从页面 DOM 兜底找大图
    imageUrls = await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .filter((im) => im.naturalWidth > 400 && im.naturalHeight > 400)
        .map((im) => im.currentSrc || im.src)
        .filter((s) => s && s.startsWith('http'))
    );
  }
  imageUrls = [...new Set(imageUrls)].slice(0, MAX_IMAGES);

  if (imageUrls.length === 0) {
    console.error('页面里既没有视频播放器,也没找到图文帖的图片。');
    console.error('确认链接是作品页;如果窗口里弹了滑块验证,完成后重试。');
    await context.close();
    process.exit(1);
  }

  for (let i = 0; i < imageUrls.length; i++) {
    const file = path.join(dir, `image-${String(i + 1).padStart(2, '0')}.jpg`);
    if (await saveRemote(imageUrls[i], file)) framePaths.push(file);
  }
}

// 文案(页面标题里通常含作品文案)和热评区文本(best-effort)
const title = (await page.title()).replace(/ - 抖音$/, '').trim();
let commentsPreview = '';
try {
  commentsPreview = await page.evaluate(() => {
    const el = document.querySelector('[data-e2e="comment-list"]');
    return el ? el.innerText.slice(0, 1200) : '';
  });
} catch {
  /* 忽略 */
}

// 语音转文字:下载音视频→ffmpeg 抽音轨→whisper 识别(全程本机,用完即删媒体文件)
let transcript = null;
let transcriptError = null;
let transcriptSource = null;
if (TRANSCRIBE) {
  // 视频帖转视频音轨;图文帖没有视频,退而转背景音乐(通常是歌曲/配音)
  const mediaUrl = hasVideo ? playUrl || musicUrl : musicUrl;
  transcriptSource = hasVideo ? (playUrl ? '视频音轨' : '背景音乐') : '图文帖的背景音乐';
  if (!mediaUrl) {
    transcriptError = hasVideo
      ? '没拿到视频播放地址(详情接口未触发),无法转写语音。'
      : '这是图文帖,没有视频音轨,也没拿到背景音乐地址。';
    transcriptSource = null;
  } else {
    const mediaPath = path.join(dir, 'media.tmp');
    if (!(await saveRemote(mediaUrl, mediaPath))) {
      transcriptError = '音视频下载失败,无法转写。';
    } else {
      try {
        const { transcribeFile } = await import('./asr.mjs');
        const r = transcribeFile(mediaPath, dir);
        if (r.text) transcript = r.text;
        else transcriptError = r.error;
      } catch (e) {
        transcriptError = '转写失败: ' + e.message;
      }
      fs.rmSync(mediaPath, { force: true });
    }
    if (!transcript) transcriptSource = null;
  }
}

if (framePaths.length === 0) {
  console.error('⚠️ 一张画面都没拿到。加 --headful 观察页面后重试。');
}
console.log(
  JSON.stringify(
    {
      url,
      media_type: mediaType, // video=视频帖(frames 是按时间截的帧);images=图文帖(frames 是原图)
      title,
      dir,
      frames: framePaths,
      comments_preview: commentsPreview,
      transcript,
      transcript_source: transcriptSource,
      transcript_error: transcriptError,
    },
    null,
    2
  )
);
await context.close();
