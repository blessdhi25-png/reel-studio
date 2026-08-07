'use client';

export default function CameraDeviceSelect({
  devices,
  selectedDeviceId,
  onChange,
  builtInDeviceId,
  className,
}) {
  if (devices.length <= 1) return null; // nothing meaningful to choose between

  return (
    <select
      value={selectedDeviceId}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Camera"
      className={
        className ||
        'bg-zinc-800/90 border border-zinc-700 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-amber-500'
      }
    >
      {devices.map((d, i) => {
        const label = d.label || `Camera ${i + 1}`;
        // Tag the detected host/built-in camera so the person can see at a
        // glance which option is being auto-prioritized over any connected
        // phone, virtual camera, or capture card.
        const isBuiltIn = builtInDeviceId && d.deviceId === builtInDeviceId;
        return (
          <option key={d.deviceId} value={d.deviceId}>
            {isBuiltIn ? `${label} (Built-in)` : label}
          </option>
        );
      })}
    </select>
  );
}
