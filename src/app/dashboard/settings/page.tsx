'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/browser';
import TenantThemeProvider from '@/components/TenantThemeProvider';
import type { Tenant } from '@/types';
import { ALL_SCHOOLS, SUGGEST_CORRECTION_URL } from '@/lib/schools';

export default function SettingsPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [primary, setPrimary] = useState('#1d4ed8');
  const [secondary, setSecondary] = useState('#7c3aed');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [showSchoolPicker, setShowSchoolPicker] = useState(false);
  const [colorMode, setColorMode] = useState<'school' | 'custom'>('school');
  const [tierFilter, setTierFilter] = useState<'all' | 'd1' | 'd2' | 'd3'>('all');
  const [selectedSchoolUnverified, setSelectedSchoolUnverified] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: appUser } = await supabase
        .from('users')
        .select('assigned_tenant_ids')
        .eq('id', user.id)
        .single();
      if (!appUser?.assigned_tenant_ids?.[0]) return;
      const { data: t } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', appUser.assigned_tenant_ids[0])
        .single();
      if (t) {
        setTenant(t);
        setDisplayName(t.display_name ?? t.displayName ?? '');
        setSlug(t.slug);
        setPrimary(t.primary_color ?? t.primaryColor ?? '#1d4ed8');
        setSecondary(t.secondary_color ?? t.secondaryColor ?? '#7c3aed');
        setLogoUrl(t.logo_url ?? t.logoUrl ?? '');
      }
    }
    load();
  }, []);

  function applySchool(school: typeof ALL_SCHOOLS[0]) {
    setDisplayName(school.name + ' Tennis');
    setSlug(school.slug + '-tennis');
    setPrimary(school.primary);
    setSecondary(school.secondary);
    setSelectedSchoolUnverified(!school.colorsVerified);
    setShowSchoolPicker(false);
    setSchoolSearch('');
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !tenant) return;
    setUploading(true);
    const supabase = createClient();
    const path = `logos/${tenant.id}/${file.name}`;
    const { error } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('tenant-assets').getPublicUrl(path);
      setLogoUrl(publicUrl);
    }
    setUploading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant) return;
    setSaving(true);
    setMessage('');
    const supabase = createClient();
    const { error } = await supabase
      .from('tenants')
      .update({
        display_name: displayName,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        primary_color: primary,
        secondary_color: secondary,
        logo_url: logoUrl || null,
      })
      .eq('id', tenant.id);
    if (error) setMessage(error.message);
    else setMessage('Settings saved!');
    setSaving(false);
  }

  const filteredSchools = ALL_SCHOOLS.filter((s) => {
    const matchesTier = tierFilter === 'all' || s.tier === tierFilter;
    const matchesSearch = s.name.toLowerCase().includes(schoolSearch.toLowerCase());
    return matchesTier && matchesSearch;
  });

  return (
    <TenantThemeProvider primaryColor={primary} secondaryColor={secondary}>
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-2xl font-black text-slate-900">School Settings</h1>
          <p className="text-slate-500 mt-1 text-sm">Branding, colors, and identity</p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">

          {/* School Picker */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div>
              <h2 className="font-bold text-slate-800">Select Your School</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Pick from a D1 university to auto-fill your school name and official colors, or choose Custom to set your own.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowSchoolPicker((v) => !v); setColorMode('school'); }}
                className="flex-1 flex items-center justify-between px-4 py-3 rounded-xl border-2 border-slate-200 hover:border-slate-300 transition-colors text-left"
              >
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">School</p>
                  <p className="font-semibold text-slate-700 mt-0.5">{displayName || 'Choose a school…'}</p>
                </div>
                <span className="text-slate-400">{showSchoolPicker ? '▲' : '▼'}</span>
              </button>
              <button
                type="button"
                onClick={() => { setColorMode('custom'); setShowSchoolPicker(false); }}
                className={`px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-colors ${
                  colorMode === 'custom'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                Custom
              </button>
            </div>

            {showSchoolPicker && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-2 border-b border-slate-100 space-y-2">
                  <input
                    type="text"
                    value={schoolSearch}
                    onChange={(e) => setSchoolSearch(e.target.value)}
                    placeholder="Search schools…"
                    className="w-full px-3 py-2 text-sm focus:outline-none"
                    autoFocus
                  />
                  <div className="flex gap-1 px-1">
                    {(['all', 'd1', 'd2', 'd3'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTierFilter(t)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${tierFilter === t ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'}`}
                      >
                        {t === 'all' ? 'All' : t.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredSchools.map((school) => (
                    <button
                      key={school.slug}
                      type="button"
                      onClick={() => applySchool(school)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                    >
                      <div className="flex gap-1 shrink-0">
                        <span className="w-4 h-4 rounded-full border border-white/50 shadow-sm" style={{ backgroundColor: school.primary }} />
                        <span className="w-4 h-4 rounded-full border border-white/50 shadow-sm" style={{ backgroundColor: school.secondary }} />
                      </div>
                      <span className="text-sm text-slate-700 flex-1">{school.name}</span>
                      <span className="text-[10px] font-bold uppercase text-slate-300">{school.tier}</span>
                    </button>
                  ))}
                  {filteredSchools.length === 0 && (
                    <p className="px-4 py-6 text-center text-sm text-slate-400">No schools found. Use Custom mode to enter your colors manually.</p>
                  )}
                </div>
              </div>
            )}

            {selectedSchoolUnverified && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                <span className="text-base leading-none">⚠️</span>
                <div>
                  Colors for this school aren&apos;t verified in our dataset — please check them below and adjust if needed.{' '}
                  <a href={SUGGEST_CORRECTION_URL} className="underline hover:text-amber-900">Suggest a correction</a>
                </div>
              </div>
            )}
          </div>

          {/* Branding card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <h2 className="font-bold text-slate-800">Details & Branding</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
                placeholder="Stanford Club Tennis"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                URL Slug
              </label>
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                <span className="px-3 py-2.5 bg-slate-50 text-slate-400 text-sm border-r border-slate-200 shrink-0">
                  /t/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                  placeholder="stanford-club-tennis"
                />
              </div>
            </div>

            {colorMode === 'school' && !selectedSchoolUnverified && (
              <p className="text-xs text-slate-400">
                Colors from our verified dataset.{' '}
                <a href={SUGGEST_CORRECTION_URL} className="underline hover:text-slate-600">Suggest a correction</a> if they look wrong.
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Primary Color
                </label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2">
                  <input
                    type="color"
                    value={primary}
                    onChange={(e) => setPrimary(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <span className="text-sm font-mono text-slate-600">{primary}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Secondary Color
                </label>
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2">
                  <input
                    type="color"
                    value={secondary}
                    onChange={(e) => setSecondary(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <span className="text-sm font-mono text-slate-600">{secondary}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Logo (PNG or SVG)
              </label>
              <div className="flex items-center gap-3">
                {logoUrl && (
                  <img src={logoUrl} alt="Logo preview" className="h-12 w-auto object-contain rounded-lg border border-slate-100 p-1" />
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="btn-secondary px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading…' : logoUrl ? 'Replace Logo' : 'Upload Logo'}
                </button>
                {logoUrl && (
                  <button type="button" onClick={() => setLogoUrl('')} className="text-xs text-red-400 hover:text-red-600">
                    Remove
                  </button>
                )}
                <input ref={fileRef} type="file" accept=".svg,.png,.jpg,.jpeg" className="hidden" onChange={handleLogoUpload} />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Recommended: square SVG or PNG with transparent background</p>
            </div>
          </div>

          {/* Live Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-bold text-slate-800">Live Preview</h2>
            <div
              className="rounded-xl p-4 flex items-center gap-3"
              style={{ backgroundColor: primary }}
            >
              {logoUrl && (
                <img src={logoUrl} alt="logo" className="h-8 w-8 object-contain rounded-lg bg-white/20 p-0.5" />
              )}
              <div className="flex-1">
                <p className="text-white font-black text-lg leading-tight">{displayName || 'Your School'}</p>
                <p className="text-white/70 text-xs">Powered by One Point Bowl</p>
              </div>
              <div
                className="w-2 h-8 rounded-full"
                style={{ backgroundColor: secondary }}
              />
            </div>
            <div className="flex gap-3">
              <button type="button" className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold">
                Register Now
              </button>
              <button type="button" className="btn-secondary px-4 py-2 rounded-xl text-sm font-semibold">
                View Bracket
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Colors update live — the buttons above use your primary color via CSS variables.
            </p>
          </div>

          {message && (
            <p className={`text-sm text-center rounded-xl p-3 ${message.includes('error') || message.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-full py-3 rounded-xl font-bold text-sm disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </form>
      </div>
    </TenantThemeProvider>
  );
}
