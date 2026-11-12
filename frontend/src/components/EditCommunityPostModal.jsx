'use client';

import { useState } from 'react';
import SlideDrawer from '@/components/SlideDrawer';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';

/** Edit a community post's caption (author, or community admin/moderator). */
export default function EditCommunityPostModal({ post, communityId, onClose, onSaved }) {
  const toast = useToast();
  const [caption, setCaption] = useState(post?.caption || '');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.editCommunityPost(communityId, post.id, caption);
      toast.success('Post updated');
      onSaved?.(res);
      onClose();
    } catch (err) {
      toast.error(err?.message || "Couldn't save your changes");
      setBusy(false);
    }
  }

  return (
    <SlideDrawer open={!!post} onClose={() => !busy && onClose()} label="Edit post">
      <form onSubmit={save} className="flex flex-col h-full">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-800">
          <h2 className="font-extrabold tracking-tight text-lg">Edit post</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <label htmlFor="ecp-caption" className="block text-[11px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1.5">
            Caption
          </label>
          <textarea
            id="ecp-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={2200}
            rows={6}
            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 px-3.5 py-3 text-sm font-medium text-black dark:text-white outline-none focus:border-amber-500 resize-none"
          />
          <p className="text-[11px] font-bold text-neutral-500 text-right mt-1">{caption.length}/2200</p>
        </div>
        <div className="px-5 pt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="py-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm font-extrabold">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-extrabold disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </SlideDrawer>
  );
}
