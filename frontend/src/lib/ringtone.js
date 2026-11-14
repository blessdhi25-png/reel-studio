// Incoming-call ringtone synthesized with WebAudio (no audio asset to ship) + vibration.
// Browsers may keep an AudioContext suspended until the page has had a user gesture; if so the
// tone is silently skipped (vibration and the on-screen modal still work).
export function startRingtone() {
  let stopped = false;
  let ctx = null;
  let timer = null;

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      ctx = new Ctx();
      ctx.resume?.().catch(() => {});
      const burst = () => {
        if (stopped || !ctx || ctx.state !== 'running') return;
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        const t0 = ctx.currentTime;
        // classic double ring: two 0.4s two-tone bursts
        [0, 0.55].forEach((offset) => {
          [440, 480].forEach((freq) => {
            const osc = ctx.createOscillator();
            osc.frequency.value = freq;
            osc.connect(gain);
            osc.start(t0 + offset);
            osc.stop(t0 + offset + 0.4);
          });
        });
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.03);
        gain.gain.setValueAtTime(0.18, t0 + 0.9);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
      };
      burst();
      timer = setInterval(burst, 3000);
    }
  } catch {
    // no audio — fall through to vibration only
  }

  let vibTimer = null;
  const vibrate = () => {
    try {
      navigator.vibrate?.([400, 200, 400]);
    } catch {}
  };
  vibrate();
  vibTimer = setInterval(vibrate, 3000);

  return function stop() {
    stopped = true;
    clearInterval(timer);
    clearInterval(vibTimer);
    try {
      navigator.vibrate?.(0);
    } catch {}
    try {
      ctx?.close();
    } catch {}
  };
}
