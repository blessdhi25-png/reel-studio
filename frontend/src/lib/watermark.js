// Shared ClipPulse watermark painter. Used by the camera compositor
// (CameraRecorder) and by the long-press "Download" flow
// (downloadWithWatermark) so both burn in exactly the same mark.
// Right-aligned in the lower-right corner; size scales with canvas width.
export function drawWatermark(ctx, username, width, height) {
  const fontSize = Math.max(12, Math.round(width * 0.05));
  const label = '⚡ ClipPulse' + (username ? ' @' + username : '');
  ctx.save();
  ctx.filter = 'none';
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fillText(label, width - Math.round(width * 0.04), height - Math.round(height * 0.05));
  ctx.restore();
}
