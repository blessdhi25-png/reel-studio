import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import prisma from '../config/db.js';

const HLS_DIR = process.env.HLS_DIR || './storage/hls';
const THUMBNAILS_DIR = process.env.THUMBNAILS_DIR || './storage/thumbnails';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const POLL_INTERVAL_MS = 5000;

if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

function transcodeToHLS(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outputDir, { recursive: true });
    const playlistPath = path.join(outputDir, 'master.m3u8');

    ffmpeg(inputPath)
      .outputOptions([
        '-codec:v libx264',
        '-codec:a aac',
        '-start_number 0',
        '-hls_time 6',
        '-hls_list_size 0',
        '-f hls',
      ])
      .output(playlistPath)
      .on('end', () => resolve(playlistPath))
      .on('error', reject)
      .run();
  });
}

// Equivalent to: ffmpeg -ss 00:00:01 -i <input> -vframes 1 -q:v 2 <output.jpg>
// fluent-ffmpeg's .screenshots() wraps exactly that command — one frame at
// the 1s mark, written as a JPEG. If the clip is shorter than 1s, ffmpeg
// just clamps to the nearest frame it can seek to rather than failing.
function extractThumbnail(inputPath, outputDir, videoId) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .on('end', () => resolve(`${videoId}.jpg`))
      .on('error', reject)
      .screenshots({
        timestamps: ['1'],
        filename: `${videoId}.jpg`,
        folder: outputDir,
        size: '640x?', // cap width, preserve aspect ratio — keeps poster images light
      });
  });
}

function getDuration(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(Math.round(metadata.format.duration || 0));
    });
  });
}

async function processOne(video) {
  console.log(`[worker] transcoding video ${video.id}`);
  try {
    const outputDir = path.join(HLS_DIR, video.id);
    const duration = await getDuration(video.rawPath);
    await transcodeToHLS(video.rawPath, outputDir);
    const videoUrl = `${BASE_URL}/hls/${video.id}/master.m3u8`;

    // Thumbnail extraction is best-effort: a failure here (corrupt frame at
    // the 1s mark, ffmpeg missing a codec, etc.) should never stop the video
    // itself from publishing — it just means thumbnailUrl stays null and the
    // frontend falls back to no poster image, same as before this feature.
    let thumbnailUrl = null;
    try {
      const filename = await extractThumbnail(video.rawPath, THUMBNAILS_DIR, video.id);
      thumbnailUrl = `${BASE_URL}/thumbnails/${filename}`;
    } catch (thumbErr) {
      console.warn(`[worker] thumbnail generation failed for ${video.id} (video will still publish):`, thumbErr.message);
    }

    await prisma.video.update({
      where: { id: video.id },
      data: { videoUrl, thumbnailUrl, durationSeconds: duration, status: 'published' },
    });
    console.log(`[worker] done: ${video.id}${thumbnailUrl ? '' : ' (no thumbnail)'}`);
  } catch (err) {
    console.error(`[worker] failed for ${video.id}:`, err.message);
    // Leave status as 'processing' so it can be retried, or flip to a 'failed'
    // status if you add one to the schema.
  }
}

async function pollLoop() {
  while (true) {
    const pending = await prisma.video.findMany({
      where: { status: 'processing', rawPath: { not: null } },
      take: 3,
    });

    for (const video of pending) {
      await processOne(video);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

console.log('[worker] transcode worker started, polling for jobs...');
pollLoop();
