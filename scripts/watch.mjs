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

// 判断是不是视频帖,要看画面能不能真的播出来:图文帖页面里也常有 <video>
// 元素(用于播放背景音乐),只按元素存在与否判断会误判。
async function videoPlayable(timeout) {
  if ((await video.count()) === 0) return false;
  return page
    .waitForFunction(
      () => {
        const v = document.querySelector('video');
        return v && v.duration > 0 && v.videoWidth > 0;
      },
      { timeout }
    )
    .then(() => true)
    .catch(() => false);
}

// 三路取图文帖的原图:详情接口 → 页面内嵌数据 → DOM 大图
async function collectImages() {
  if (apiImages.length) {
    console.error(`图文帖:从详情接口拿到 ${apiImages.length} 张图`);
    return apiImages;
  }

  // 页面内嵌的 SSR 数据里递归找 images[].url_list
  const stateImages = await page.evaluate(() => {
    const out = [];
    const seenUrl = new Set();
    const seenObj = new WeakSet();
    const visit = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 10 || out.length > 60) return;
      if (seenObj.has(node)) return;
      seenObj.add(node);
      if (Array.isArray(node)) {
        for (const it of node) visit(it, depth + 1);
        return;
      }
      if (Array.isArray(node.images)) {
        for (const im of node.images) {
          const u = (im?.url_list || []).find((x) => typeof x === 'string' && x.startsWith('http'));
          if (u && !seenUrl.has(u)) {
            seenUrl.add(u);
            out.push(u);
          }
        }
      }
      for (const k of Object.keys(node)) {
        try {
          visit(node[k], depth + 1);
        } catch {
          /* getter 抛错,跳过 */
        }
      }
    };
    for (const r of [window._ROUTER_DATA, window.__INITIAL_STATE__, window.__NUXT__]) visit(r, 0);
    const el = document.getElementById('RENDER_DATA');
    if (el) {
      try {
        visit(JSON.parse(decodeURIComponent(el.textContent)), 0);
      } catch {
        /* 解析失败忽略 */
      }
    }
    return out;
  });
  if (stateImages.length) {
    console.error(`图文帖:从页面内嵌数据拿到 ${stateImages.length} 张图`);
    return stateImages;
  }

  // DOM 兜底:先翻几页把懒加载的图触发出来,再收集大图
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('ArrowRight').catch(() => {});
    await page.waitForTimeout(600);
  }
  const domImages = await page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .filter((im) => im.naturalWidth >= 300 && im.naturalHeight >= 300)
      .map((im) => im.currentSrc || im.src)
      .filter((s) => s && s.startsWith('http'))
  );
  if (domImages.length) console.error(`图文帖:从页面 DOM 兜底拿到 ${domImages.length} 张图`);
  return domImages;
}

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

// 先给视频 12 秒机会;播不出来就找图片;都没有再多等视频 20 秒(防止网慢误判)
let playable = await videoPlayable(12000);
let imageUrls = [];
if (!playable) {
  imageUrls = [...new Set(await collectImages())].slice(0, MAX_IMAGES);
  if (imageUrls.length === 0) {
    console.error('没找到图片,再等一会儿视频……');
    playable = await videoPlayable(20000);
  }
}

const mediaType = playable ? 'video' : 'images';
const framePaths = [];

if (playable) {
  // ===== 视频帖:在整条时长上均匀取点截帧 =====
  const meta = await page.evaluate(() => {
    const v = document.querySelector('video');
    v.muted = true;
    return { duration: v.duration };
  });

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
  // ===== 图文帖(图片合集):把每张原图下载下来 =====
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
  const mediaUrl = playable ? playUrl || musicUrl : musicUrl;
  transcriptSource = playable ? (playUrl ? '视频音轨' : '背景音乐') : '图文帖的背景音乐';
  if (!mediaUrl) {
    transcriptError = playable
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

// 一张都没拿到时留个现场快照,方便排查(交给 Claude 看图即可判断是验证码还是改版)
let debugShot = null;
if (framePaths.length === 0) {
  debugShot = path.join(dir, 'debug-page.png');
  await page.screenshot({ path: debugShot, fullPage: false }).catch(() => (debugShot = null));
  console.error('⚠️ 一张画面都没拿到:视频播不出来,也没找到图文帖的图片。');
  if (debugShot) console.error(`   已保存页面快照 ${debugShot},可以让 Claude 看这张图判断原因(常见是滑块验证)。`);
}

console.log(
  JSON.stringify(
    {
      url,
      media_type: mediaType, // video=视频帖(frames 是按时间截的帧);images=图文帖(frames 是原图)
      title,
      dir,
      frames: framePaths,
      debug_screenshot: debugShot,
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
