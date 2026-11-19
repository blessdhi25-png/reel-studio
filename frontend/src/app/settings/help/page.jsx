'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, KeyRound, LifeBuoy, MessageCircle, ShieldAlert, ShieldCheck, Ticket } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsUI';
import { FEATURED, HELP_CATEGORIES } from '@/lib/helpContent';

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '';
const COLLAPSED_COUNT = 4;

function Faq({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 dark:border-neutral-800 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 py-4 text-left"
      >
        <span className="flex-1 font-sans font-medium text-[15px] leading-snug text-slate-900 dark:text-white">{item.q}</span>
        <ChevronDown size={18} className={`shrink-0 text-slate-400 dark:text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="pb-4 -mt-1">
          <p className="font-sans text-sm leading-relaxed text-slate-600 dark:text-neutral-400">{item.a}</p>
          {item.steps && (
            <ol className="mt-2.5 space-y-2 rounded-xl bg-slate-100 dark:bg-neutral-900 p-3.5">
              {item.steps.map((st, i) => (
                <li key={i} className="flex gap-2.5 font-sans text-sm leading-snug text-slate-700 dark:text-neutral-300">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span>{st}</span>
                </li>
              ))}
            </ol>
          )}
          {item.link && (
            <Link href={item.link.href} className="mt-2.5 inline-flex items-center gap-1 font-sans font-bold text-sm text-amber-600 dark:text-amber-400">
              {item.link.label} <ChevronRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function QuickCard({ href, Icon, label, sub, tone }) {
  const cls = 'shrink-0 w-36 rounded-2xl bg-white dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 p-4 hover:bg-slate-50 dark:hover:bg-neutral-800/60 transition-colors';
  const body = (
    <>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${tone}`}>
        <Icon size={20} strokeWidth={2.25} />
      </span>
      <span className="block font-sans font-bold text-sm text-slate-900 dark:text-white leading-snug">{label}</span>
      {sub && <span className="block font-sans text-xs text-slate-500 dark:text-neutral-400 leading-snug mt-1">{sub}</span>}
    </>
  );
  return href.startsWith('mailto:') ? (
    <a href={href} className={cls}>{body}</a>
  ) : (
    <Link href={href} className={cls}>{body}</Link>
  );
}

export default function HelpCentrePage() {
  const [active, setActive] = useState(HELP_CATEGORIES[0].id);
  const [expanded, setExpanded] = useState({}); // category id -> "See more" pressed
  const sectionRefs = useRef({});
  const tabRefs = useRef({});
  const scrollingTo = useRef(null);

  // Highlight the tab for whichever section is under the sticky bars.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        if (scrollingTo.current) return; // don't fight a tab-initiated smooth scroll
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.dataset.cat);
      },
      { rootMargin: '-110px 0px -65% 0px', threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Keep the active pill visible in the horizontally scrolling tab row.
  useEffect(() => {
    tabRefs.current[active]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [active]);

  function goTo(id) {
    setActive(id);
    scrollingTo.current = id;
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => (scrollingTo.current = null), 700);
  }

  const featured = FEATURED.map(([cat, i]) => HELP_CATEGORIES.find((c) => c.id === cat)?.items[i]).filter(Boolean);
  const supportHref = SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('ClipPulse support request')}` : null;

  return (
    <SettingsPage title="Help Centre">
      <div className="pb-24 lg:pb-0">
      <h2 className="font-sans font-extrabold text-3xl tracking-tight text-slate-900 dark:text-white mb-5">How can we help?</h2>

      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1 mb-7">
        <QuickCard href="/settings/help/tickets" Icon={Ticket} label="Support tickets" sub="Create requests & check status" tone="bg-amber-500/10 text-amber-500" />
        <QuickCard href="/settings/help/security" Icon={ShieldAlert} label="Security alerts" sub="New logins & account changes" tone="bg-rose-500/10 text-rose-500" />
        <QuickCard href="/forgot-password" Icon={KeyRound} label="Account recovery" tone="bg-blue-500/10 text-blue-500" />
        <QuickCard href="/legal/guidelines" Icon={ShieldCheck} label="Safety Centre" tone="bg-emerald-500/10 text-emerald-500" />
        {supportHref && <QuickCard href={supportHref} Icon={LifeBuoy} label="Support" tone="bg-indigo-500/10 text-indigo-500" />}
      </div>

      <h3 className="font-sans font-bold text-xl text-slate-900 dark:text-white mb-1">Frequently asked questions</h3>
      <div className="mb-8">
        {featured.map((item) => (
          <Faq key={item.q} item={item} />
        ))}
      </div>

      {/* Category tabs: stick under the page header and scroll to each section. */}
      <div className="sticky top-14 z-20 -mx-4 px-4 py-2.5 bg-slate-50/95 dark:bg-[#0a090e]/95 backdrop-blur border-b border-slate-200/70 dark:border-neutral-800/70">
        <div role="tablist" aria-label="Help topics" className="flex gap-2 overflow-x-auto no-scrollbar">
          {HELP_CATEGORIES.map((c) => {
            const on = active === c.id;
            return (
              <button
                key={c.id}
                ref={(el) => (tabRefs.current[c.id] = el)}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => goTo(c.id)}
                className={`shrink-0 px-4 py-2 rounded-full font-sans font-bold text-sm transition-colors ${
                  on ? 'bg-slate-900 text-white dark:bg-white dark:text-black' : 'bg-slate-200/70 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-700'
                }`}
              >
                {c.title}
              </button>
            );
          })}
        </div>
      </div>

      {HELP_CATEGORIES.map((c) => {
        const showAll = expanded[c.id];
        const items = showAll ? c.items : c.items.slice(0, COLLAPSED_COUNT);
        return (
          <section
            key={c.id}
            data-cat={c.id}
            ref={(el) => (sectionRefs.current[c.id] = el)}
            className="pt-7 scroll-mt-32 border-b border-slate-200 dark:border-neutral-800 pb-6 last:border-0"
          >
            <h3 className="font-sans font-bold text-xl text-slate-900 dark:text-white mb-1">{c.title}</h3>
            <div>
              {items.map((item) => (
                <Faq key={item.q} item={item} />
              ))}
            </div>
            {c.items.length > COLLAPSED_COUNT && (
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [c.id]: !e[c.id] }))}
                className="mt-3 w-full py-3 rounded-full bg-slate-200/70 dark:bg-neutral-800 font-sans font-bold text-sm text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors"
              >
                {showAll ? 'See less' : 'See more'}
              </button>
            )}
          </section>
        );
      })}

      <div className="mt-6 rounded-2xl bg-white dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 p-5 text-center">
        <p className="font-sans font-bold text-base text-slate-900 dark:text-white">Still need help?</p>
        <p className="font-sans text-sm text-slate-500 dark:text-neutral-400 mt-1">
          {supportHref ? 'Our team can look into it for you.' : 'Check the Community Guidelines, or use Report on a video or profile for safety concerns.'}
        </p>
        {supportHref ? (
          <a href={supportHref} className="mt-4 inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors">
            Contact support
          </a>
        ) : (
          <Link href="/legal/guidelines" className="mt-4 inline-flex items-center justify-center w-full py-3.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors">
            Community Guidelines
          </Link>
        )}
      </div>
      </div>

      {/* Pinned above the mobile bottom nav (~4rem); sits in the corner on desktop where there is no nav. */}
      <div className="fixed inset-x-0 bottom-[4.25rem] lg:bottom-6 z-30 px-4 pointer-events-none">
        <div className="mx-auto max-w-2xl lg:max-w-none lg:flex lg:justify-end">
          <Link
            href="/settings/help/tickets/new"
            className="pointer-events-auto flex items-center justify-center gap-2 w-full lg:w-auto lg:px-6 py-3.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-sans font-bold text-sm shadow-xl transition-colors"
          >
            <MessageCircle size={18} strokeWidth={2.5} aria-hidden="true" /> Chat with us
          </Link>
        </div>
      </div>
    </SettingsPage>
  );
}
