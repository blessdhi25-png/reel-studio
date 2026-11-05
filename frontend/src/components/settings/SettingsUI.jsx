'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Shared building blocks for the Settings & Privacy architecture. Every
// settings screen uses these so spacing, typography (font-sans font-bold),
// chevrons and the bottom-nav clearance (pb-28) stay identical.

export function SettingsPage({ title, backHref = '/settings', backLabel = 'Settings', children }) {
  return (
    <div className="min-h-screen bg-[#0a090e] text-white font-sans pb-28">
      <div className="max-w-md mx-auto px-4 pt-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-0.5 -ml-1 py-1 pr-2 text-sm font-bold text-amber-500 hover:text-amber-400"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          {backLabel}
        </Link>
        <h1 className="font-sans font-bold text-2xl tracking-tight mt-3 mb-6">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function SettingsGroup({ title, children, footer }) {
  return (
    <section>
      {title && (
        <h2 className="font-sans font-bold text-[11px] tracking-widest uppercase text-neutral-500 px-1 mb-2">
          {title}
        </h2>
      )}
      <div className="bg-neutral-900/90 rounded-2xl border border-neutral-800 overflow-hidden mb-5 divide-y divide-neutral-800">
        {children}
      </div>
      {footer && <p className="font-sans font-medium text-xs text-neutral-500 px-1 -mt-3 mb-5">{footer}</p>}
    </section>
  );
}

const ROW_BASE = 'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors';
const ROW_INTERACTIVE = 'hover:bg-neutral-800/60 active:bg-neutral-800';

function RowBody({ icon, title, subtitle, right, chevron, tone }) {
  return (
    <>
      {icon && (
        <span
          aria-hidden="true"
          className="w-9 h-9 shrink-0 rounded-xl bg-neutral-800 flex items-center justify-center text-lg"
        >
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span
          className={`block font-sans font-bold text-sm leading-snug break-words ${
            tone === 'amber' ? 'text-amber-400' : 'text-white'
          }`}
        >
          {title}
        </span>
        {subtitle && (
          <span className="block font-sans font-medium text-xs text-neutral-400 mt-0.5 leading-snug break-words">
            {subtitle}
          </span>
        )}
      </span>
      {right}
      {chevron && <ChevronRight size={18} className="text-neutral-600 shrink-0" aria-hidden="true" />}
    </>
  );
}

// A row is exactly one of: a link (href), a button (onClick), or static.
export function SettingsRow({ href, onClick, icon, title, subtitle, right, tone, chevron = true, ...aria }) {
  const body = <RowBody {...{ icon, title, subtitle, right, tone, chevron: chevron && (href || onClick) }} />;
  if (href) {
    return (
      <Link href={href} className={`${ROW_BASE} ${ROW_INTERACTIVE}`} {...aria}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${ROW_BASE} ${ROW_INTERACTIVE}`} {...aria}>
        {body}
      </button>
    );
  }
  return <div className={ROW_BASE}>{body}</div>;
}

// A static row with a control underneath (e.g. a Segmented filter). Same icon /
// title / subtitle layout as SettingsRow so groups stay visually aligned.
export function SettingsBlock({ icon, title, subtitle, children }) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3 mb-3">
        <RowBody icon={icon} title={title} subtitle={subtitle} />
      </div>
      {children}
    </div>
  );
}

export function Switch({ checked, disabled }) {
  return (
    <span
      aria-hidden="true"
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors motion-reduce:transition-none ${
        checked ? 'bg-amber-500' : 'bg-neutral-700'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </span>
  );
}

// Whole row is the switch, so the tap target is the full width.
export function ToggleRow({ icon, title, subtitle, checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${ROW_BASE} ${ROW_INTERACTIVE} disabled:cursor-not-allowed`}
    >
      <RowBody icon={icon} title={title} subtitle={subtitle} right={<Switch checked={checked} disabled={disabled} />} />
    </button>
  );
}

export function Segmented({ label, options, value, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1 bg-neutral-950 border border-neutral-800 rounded-xl p-1">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`py-2 rounded-lg font-sans font-bold text-xs transition-colors disabled:opacity-50 ${
              active ? 'bg-amber-500 text-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function VerifiedBadge({ verified }) {
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans font-bold text-[10px] uppercase tracking-wide ${
        verified ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-neutral-800 text-neutral-400'
      }`}
    >
      {verified ? '✓ Verified' : 'Unverified'}
    </span>
  );
}
