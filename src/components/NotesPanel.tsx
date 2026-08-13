'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';

export type NoteKind = 'note' | 'feedback';

export interface TournamentNote {
  id: string;
  tournamentId: string;
  authorEmail: string | null;
  kind: NoteKind;
  body: string;
  createdAt: string;
}

const KIND_LABEL: Record<NoteKind, string> = {
  note: 'Note',
  feedback: 'Feedback',
};

const KIND_STYLE: Record<NoteKind, string> = {
  note: 'bg-slate-100 text-slate-600',
  feedback: 'bg-amber-100 text-amber-700',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Reads a tournament's log, newest first. Returns data rather than setting state. */
async function fetchNotes(
  tournamentId: string,
): Promise<{ notes: TournamentNote[]; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tournament_notes')
    .select('id, tournament_id, author_email, kind, body, created_at')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false });

  if (error) return { notes: [], error: error.message };

  return {
    notes: (data ?? []).map((n) => ({
      id: n.id as string,
      tournamentId: n.tournament_id as string,
      authorEmail: (n.author_email as string | null) ?? null,
      kind: (n.kind as NoteKind) ?? 'note',
      body: n.body as string,
      createdAt: n.created_at as string,
    })),
  };
}

/**
 * The director's running log for a tournament.
 *
 * Every entry is kept and listed newest first, so this reads as a history of
 * how the event went rather than one scratch field that the next edit erases.
 * Notes cover the day-to-day ("court 3 net is low"); feedback is the same log
 * flagged for the things worth revisiting once the tournament is over.
 */
export default function NotesPanel({ tournamentId }: { tournamentId: string }) {
  const [notes, setNotes] = useState<TournamentNote[]>([]);
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<NoteKind>('note');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { notes: fetched, error: loadError } = await fetchNotes(tournamentId);
    if (loadError) {
      setError(loadError);
    } else {
      setNotes(fetched);
      setError('');
    }
    setLoading(false);
  }, [tournamentId]);

  // Reloads whenever the tournament changes. The guard drops a response that
  // arrives after this panel has moved on, so a slow request for the previous
  // tournament can't overwrite the current one's list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { notes: fetched, error: loadError } = await fetchNotes(tournamentId);
      if (cancelled) return;
      if (loadError) setError(loadError);
      else {
        setNotes(fetched);
        setError('');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tournamentId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError('');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('tournament_notes').insert({
      tournament_id: tournamentId,
      author_id: user?.id ?? null,
      author_email: user?.email ?? null,
      kind,
      body: trimmed,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setBody('');
    setSaving(false);
    await load();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError('');
    const supabase = createClient();
    const { error: deleteError } = await supabase.from('tournament_notes').delete().eq('id', id);
    if (deleteError) setError(deleteError.message);
    setDeletingId(null);
    await load();
  }

  const noteCount = notes.filter((n) => n.kind === 'note').length;
  const feedbackCount = notes.filter((n) => n.kind === 'feedback').length;

  return (
    <div className="space-y-5">
      {/* Composer */}
      <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <h2 className="font-bold text-slate-800">Add a Note</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Keep a running record for this tournament — everything you add stays in the list below.
          </p>
        </div>

        <div className="flex gap-2">
          {(['note', 'feedback'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                kind === k
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder={
            kind === 'feedback'
              ? 'What should change next time? Anything that slowed the day down, or worked well enough to keep.'
              : 'Court 3 net is low. Player check-in ran long — start 15 minutes earlier next year.'
          }
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1 resize-y"
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {notes.length === 0
              ? 'No entries yet'
              : `${notes.length} saved · ${noteCount} note${noteCount === 1 ? '' : 's'} · ${feedbackCount} feedback`}
          </p>
          <button
            type="submit"
            disabled={saving || !body.trim()}
            className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Save ${KIND_LABEL[kind]}`}
          </button>
        </div>

        {error && (
          <p className="text-sm bg-red-50 text-red-700 rounded-xl px-4 py-2.5">{error}</p>
        )}
      </form>

      {/* Saved entries */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
          Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-3xl mb-2">📝</p>
          <p className="font-semibold text-slate-600">No notes yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Anything you save above is kept here, newest first.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${KIND_STYLE[n.kind]}`}>
                    {KIND_LABEL[n.kind]}
                  </span>
                  <span className="text-xs text-slate-400">{formatWhen(n.createdAt)}</span>
                  {n.authorEmail && (
                    <span className="text-xs text-slate-400 truncate">· {n.authorEmail}</span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(n.id)}
                  disabled={deletingId === n.id}
                  className="shrink-0 text-xs text-slate-300 hover:text-red-600 font-semibold transition-colors disabled:opacity-50"
                  title="Delete this entry"
                >
                  {deletingId === n.id ? '…' : 'Delete'}
                </button>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
