'use client';

import BackButton from '@/components/BackButton';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

// Shared building blocks for the Settings & Privacy architecture. Every
// settings screen uses these so spacing, typography (font-sans font-bold),
// chevrons and the bottom-nav clearance (pb-36) stay identical.

// Sticky top bar (back · centred title) like the rest of the settings tree, then the page body.
export function SettingsPage({ title, backHref = '/settings', backLabel = 'Settings', children, headerRight }) {
  const { tx } = useLanguage();
  title = tx(title);
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a090e] text-slate-900 dark:text-white font-sans pb-36">
      <header className="sticky top-0 z-30 bg-slate-50/90 dark:bg-[#0a090e]/90 backdrop-blur-md border-b border-slate-200/70 dark:border-neutral-800/70">
        <div className="max-w-md mx-auto h-14 px-2 grid grid-cols-[3rem_1fr_3rem] items-center">
          <BackButton href={backHref} label={`Back to ${backLabel}`} className="!bg-transparent hover:!bg-slate-200/70 dark:hover:!bg-neutral-800" />
          <h1 className="font-sans font-bold text-base text-center truncate">{title}</h1>
          <div className="flex justify-end">{headerRight}</div>
        </div>
      </header>
      <div className="max-w-md mx-auto px-4 pt-5">{children}</div>
    </div>
  );
}

// Profile summary shown at the top of Settings and Privacy.
export function SettingsUserCard({ user, email, verified, href }) {
  const name = user?.displayName || user?.username || 'Your account';
  const content = (
    <>
      <span className="w-14 h-14 rounded-full overflow-hidden bg-slate-200 dark:bg-neutral-800 ring-2 ring-amber-500/60 flex items-center justify-center shrink-0 font-sans font-bold text-xl text-slate-900 dark:text-white">
        {user?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          (name[0] || '?').toUpperCase()
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-sans font-bold text-base text-slate-900 dark:text-white truncate">{name}</span>
        <span className="block font-sans font-medium text-sm text-slate-500 dark:text-neutral-400 truncate">@{user?.username}</span>
        {email && <span className="block font-sans text-xs text-slate-500 dark:text-neutral-500 truncate mt-0.5">{email}</span>}
      </span>
      {verified != null && <VerifiedBadge verified={verified} />}
      {href && <ChevronRight size={18} className="text-slate-400 dark:text-neutral-600 shrink-0" aria-hidden="true" />}
    </>
  );
  const cls = 'w-full flex items-center gap-3.5 p-4 mb-6 rounded-2xl bg-white dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 shadow-sm';
  return href ? (
    <Link href={href} className={`${cls} hover:bg-slate-50 dark:hover:bg-neutral-800/60 transition-colors`}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  );
}

export function SettingsGroup({ title, children, footer }) {
  const { tx } = useLanguage();
  title = tx(title);
  return (
    <section>
      {title && (
        <h2 className="font-sans font-bold text-[11px] tracking-widest uppercase text-slate-500 dark:text-neutral-500 px-1 mb-2">
          {title}
        </h2>
      )}
      <div className="bg-white dark:bg-neutral-900/90 rounded-2xl border border-slate-200 dark:border-neutral-800 shadow-sm overflow-hidden mb-5 divide-y divide-slate-100 dark:divide-neutral-800">
        {children}
      </div>
      {footer && <p className="font-sans font-medium text-xs text-slate-500 dark:text-neutral-500 px-1 -mt-3 mb-5">{footer}</p>}
    </section>
  );
}

const ROW_BASE = 'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors';
const ROW_INTERACTIVE = 'hover:bg-slate-100 dark:hover:bg-neutral-800/60 active:bg-neutral-800';

function RowBody({ icon, title, subtitle, right, chevron, tone }) {
  const { tx } = useLanguage();
  title = tx(title);
  subtitle = tx(subtitle);
  return (
    <>
      {icon && (
        <span
          aria-hidden="true"
          className="w-9 h-9 shrink-0 rounded-xl bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-lg text-slate-700 dark:text-neutral-200"
        >
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span
          className={`block font-sans font-bold text-sm leading-snug break-words ${
            tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
          }`}
        >
          {title}
        </span>
        {subtitle && (
          <span className="block font-sans font-medium text-xs text-slate-500 dark:text-neutral-400 mt-0.5 leading-snug break-words">
            {subtitle}
          </span>
        )}
      </span>
      {right}
      {chevron && <ChevronRight size={18} className="text-slate-400 dark:text-neutral-600 shrink-0" aria-hidden="true" />}
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
        checked ? 'bg-amber-500' : 'bg-slate-300 dark:bg-neutral-700'
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
    <div role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} className="grid gap-1 bg-white dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 rounded-xl p-1">
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
              active ? 'bg-amber-500 text-black' : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
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
        verified ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-100 dark:bg-neutral-800 text-neutral-400'
      }`}
    >
      {verified ? '✓ Verified' : 'Unverified'}
    </span>
  );
}
