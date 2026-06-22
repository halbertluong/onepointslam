'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/browser';
import TenantThemeProvider from '@/components/TenantThemeProvider';
import type { Tenant } from '@/types';

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

  return (
    <TenantThemeProvider primaryColor={primary} secondaryColor={secondary}>
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-2xl font-black text-slate-900">School Settings</h1>
          <p className="text-slate-500 mt-1 text-sm">Branding, colors, and identity</p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Branding card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <h2 className="font-bold text-slate-800">Branding</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                School Name
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
                  {uploading ? 'Uploading…' : 'Upload Logo'}
                </button>
                <input ref={fileRef} type="file" accept=".svg,.png,.jpg,.jpeg" className="hidden" onChange={handleLogoUpload} />
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
            <h2 className="font-bold text-slate-800">Live Preview</h2>
            <div
              className="rounded-xl p-4 flex items-center justify-between"
              style={{ backgroundColor: primary }}
            >
              <span className="text-white font-bold">{displayName || 'School Name'}</span>
              <span className="text-white/80 text-sm">One Point Slam</span>
            </div>
            <div className="flex gap-3">
              <button type="button" className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold">
                Register Now
              </button>
              <button type="button" className="btn-secondary px-4 py-2 rounded-xl text-sm font-semibold">
                View Bracket
              </button>
            </div>
          </div>

          {message && (
            <p className="text-sm text-center text-slate-700 bg-slate-50 rounded-xl p-3">{message}</p>
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
