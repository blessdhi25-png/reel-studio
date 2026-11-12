'use client';

import { useRef, useState } from 'react';
import { Camera, Film, FileVideo, Image as ImageIcon, UploadCloud, HardDrive, X } from 'lucide-react';

const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm';
const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

/**
 * Desktop (lg+) landing for /upload: pick or drop a file instead of opening the
 * full-screen camera. The page hands the chosen file to the same pickFile() the
 * camera screen's gallery button uses, so videos go to the publish step and
 * photos go to the photo studio.
 */
export default function DesktopUploadLanding({ onPick, onOpenCamera, onExit, error, communityTarget }) {
  const [tab, setTab] = useState('video');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const isVideo = tab === 'video';

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    onPick(e.dataTransfer.files?.[0]);
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight">Upload</h1>
          <button type="button" onClick={onExit} aria-label="Close upload" className="w-9 h-9 rounded-full bg-neutral-900 hover:bg-neutral-800 flex items-center justify-center">
            <X className="w-4 h-4" strokeWidth={3} />
          </button>
        </div>

        {/* Banner */}
        <div className="flex items-center gap-5 rounded-2xl border border-neutral-800 bg-gradient-to-r from-amber-500/15 via-fuchsia-500/10 to-indigo-500/15 px-6 py-5 mb-6">
          <span className="w-12 h-12 rounded-xl bg-amber-500 text-black flex items-center justify-center shrink-0">
            <Film className="w-6 h-6" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold tracking-tight">Post a video or photo to ClipPulse</p>
            <p className="text-sm font-bold text-neutral-300">
              Upload from your computer, or open the camera studio to film with filters and effects.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenCamera}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-extrabold hover:bg-neutral-200 transition-colors"
          >
            <Camera className="w-4 h-4" strokeWidth={2.75} /> Open camera
          </button>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950">
          <div role="tablist" aria-label="Post type" className="flex gap-6 px-6 border-b border-neutral-800">
            {[
              ['video', 'Videos'],
              ['photo', 'Photos'],
            ].map(([id, label]) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`py-4 -mb-px border-b-2 text-lg font-extrabold tracking-tight transition-colors ${
                  tab === id ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {communityTarget && (
              <p className="text-sm font-bold text-neutral-400 mb-3">
                Posting to <span className="text-amber-400">{communityTarget.name}</span>
              </p>
            )}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`rounded-xl border-2 border-dashed min-h-[22rem] flex flex-col items-center justify-center gap-3 text-center px-6 transition-colors ${
                dragOver ? 'border-amber-500 bg-amber-500/10' : 'border-neutral-700 bg-black'
              }`}
            >
              <span className="w-16 h-16 rounded-2xl bg-neutral-900 flex items-center justify-center text-amber-400">
                <UploadCloud className="w-8 h-8" strokeWidth={2.25} />
              </span>
              <p className="text-xl font-extrabold tracking-tight">{isVideo ? 'Select video to upload' : 'Select photo to upload'}</p>
              <p className="text-sm font-bold text-neutral-400">Or drag and drop it here</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-2 px-10 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-base font-extrabold transition-colors"
              >
                {isVideo ? 'Select video' : 'Select photo'}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={isVideo ? VIDEO_ACCEPT : PHOTO_ACCEPT}
                className="hidden"
                onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>
            {error && <p className="mt-3 text-sm font-bold text-red-400" role="alert">{error}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mt-6 text-sm">
          <div className="flex gap-3">
            <HardDrive className="w-5 h-5 shrink-0 text-neutral-300" strokeWidth={2.5} />
            <div>
              <p className="font-extrabold tracking-tight">Size limits</p>
              <p className="font-bold text-neutral-400">Videos up to 2 GB · photos up to 20 MB</p>
            </div>
          </div>
          <div className="flex gap-3">
            <FileVideo className="w-5 h-5 shrink-0 text-neutral-300" strokeWidth={2.5} />
            <div>
              <p className="font-extrabold tracking-tight">Video formats</p>
              <p className="font-bold text-neutral-400">MP4, MOV (QuickTime) and WebM</p>
            </div>
          </div>
          <div className="flex gap-3">
            <ImageIcon className="w-5 h-5 shrink-0 text-neutral-300" strokeWidth={2.5} />
            <div>
              <p className="font-extrabold tracking-tight">Photo formats</p>
              <p className="font-bold text-neutral-400">JPG, PNG, WEBP and GIF</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
