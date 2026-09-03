'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import SlugField from '@/components/SlugField';
import { slugify, validateTournamentSlug } from '@/lib/slugs';
import type { Tournament } from '@/types';

/**
 * Lets a director choose the readable part of their registration link.
 *
 * Renaming is safe by design: the tournament's id still resolves on the public
 * routes, so QR codes and confirmation emails already in circulation keep
 * working. Only a previously shared *slug* stops resolving, which is what the
 * warning below is about.
 *
 * Keyed on the saved slug by its parent, so a save elsewhere on the page that
 * reloads the tournament remounts this with the new value rather than leaving a
 * stale one in the box.
 */
export default function TournamentUrlCard({
  tournament,
  tenantSlug,
  onSaved,
}: {
  tournament: Tournament;
  tenantSlug: string;
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState(tournament.slug ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const changed = slug !== (tournament.slug ?? '');
  const suggestion = slugify(tournament.name);
  const registrationUrl = `/t/${tenantSlug}/${tournament.slug}/register`;

  async function handleSave() {
    const problem = validateTournamentSlug(slug);
    if (problem) { setError(problem); return; }

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from('tournaments')
      .update({ slug })
      .eq('id', tournament.id);
    setSaving(false);

    if (err) {
      // 23505 unique_violation — another tournament in this program has it.
      // 23514 check_violation — the shape rules, which the client already
      // checks, so this only fires for something we haven't thought of.
      setError(
        err.code === '23505'
          ? 'Another tournament in your program already uses that link. Try adding the season or year.'
          : err.code === '23514'
            ? 'Use lowercase letters, numbers, and single dashes only.'
            : err.message,
      );
      return;
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSaved();
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}${registrationUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
      <div>
        <h2 className="font-bold text-slate-800">Registration Link</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          The address players type in or scan. Give it a name they can read off a flyer.
        </p>
      </div>

      <SlugField
        label="Tournament URL"
        prefix={`/t/${tenantSlug}/`}
        suffix="/register"
        value={slug}
        onChange={(v) => { setSlug(v); setError(null); }}
        placeholder="portland-one-point-bowl-fall-2026"
        error={error}
        hint={
          <>
            Lowercase letters, numbers, and dashes.
            {suggestion && suggestion !== slug && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => { setSlug(suggestion); setError(null); }}
                  className="underline hover:text-slate-600"
                >
                  Use the tournament name ({suggestion})
                </button>
              </>
            )}
          </>
        }
      />

      {changed && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          Changing this retires the old link. Anything printed with the previous
          name stops working — QR codes and emails that use the tournament&apos;s ID
          keep working either way.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !changed}
          className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save link'}
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
        >
          {copied ? '✓ Copied!' : '🔗 Copy current link'}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-semibold">✓ Link updated</span>}
      </div>
    </div>
  );
}
