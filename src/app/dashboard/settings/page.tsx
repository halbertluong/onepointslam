'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/browser';
import TenantThemeProvider from '@/components/TenantThemeProvider';
import type { Tenant } from '@/types';

// Major D1 universities with official colors
const D1_SCHOOLS = [
  { name: 'Alabama Crimson Tide',       slug: 'alabama',          primary: '#9E1B32', secondary: '#828A8F' },
  { name: 'Arizona State Sun Devils',   slug: 'arizona-state',    primary: '#8C1D40', secondary: '#FFC627' },
  { name: 'Arizona Wildcats',           slug: 'arizona',          primary: '#003366', secondary: '#CC0033' },
  { name: 'Arkansas Razorbacks',        slug: 'arkansas',         primary: '#9D2235', secondary: '#000000' },
  { name: 'Auburn Tigers',              slug: 'auburn',           primary: '#0C2340', secondary: '#E87722' },
  { name: 'Baylor Bears',               slug: 'baylor',           primary: '#154734', secondary: '#FFB81C' },
  { name: 'Boston College Eagles',      slug: 'boston-college',   primary: '#98002E', secondary: '#BC9B6A' },
  { name: 'Cal Bears',                  slug: 'cal',              primary: '#003262', secondary: '#FDB515' },
  { name: 'Clemson Tigers',             slug: 'clemson',          primary: '#F66733', secondary: '#522D80' },
  { name: 'Colorado Buffaloes',         slug: 'colorado',         primary: '#CFB87C', secondary: '#000000' },
  { name: 'Duke Blue Devils',           slug: 'duke',             primary: '#003087', secondary: '#FFFFFF' },
  { name: 'Florida Gators',             slug: 'florida',          primary: '#0021A5', secondary: '#FA4616' },
  { name: 'Florida State Seminoles',    slug: 'florida-state',    primary: '#782F40', secondary: '#CEB888' },
  { name: 'Georgia Bulldogs',           slug: 'georgia',          primary: '#BA0C2F', secondary: '#000000' },
  { name: 'Georgia Tech Yellow Jackets',slug: 'georgia-tech',     primary: '#B3A369', secondary: '#003057' },
  { name: 'Illinois Fighting Illini',   slug: 'illinois',         primary: '#13294B', secondary: '#E84A27' },
  { name: 'Indiana Hoosiers',           slug: 'indiana',          primary: '#990000', secondary: '#FFFFFF' },
  { name: 'Iowa Hawkeyes',              slug: 'iowa',             primary: '#FFCD00', secondary: '#000000' },
  { name: 'Iowa State Cyclones',        slug: 'iowa-state',       primary: '#C8102E', secondary: '#F1BE48' },
  { name: 'Kansas Jayhawks',            slug: 'kansas',           primary: '#0051A5', secondary: '#E8000D' },
  { name: 'Kansas State Wildcats',      slug: 'kansas-state',     primary: '#512888', secondary: '#FFFFFF' },
  { name: 'Kentucky Wildcats',          slug: 'kentucky',         primary: '#0033A0', secondary: '#FFFFFF' },
  { name: 'LSU Tigers',                 slug: 'lsu',              primary: '#461D7C', secondary: '#FDD023' },
  { name: 'Louisville Cardinals',       slug: 'louisville',       primary: '#AD0000', secondary: '#000000' },
  { name: 'Maryland Terrapins',         slug: 'maryland',         primary: '#E03A3E', secondary: '#FFD520' },
  { name: 'Michigan Wolverines',        slug: 'michigan',         primary: '#00274C', secondary: '#FFCB05' },
  { name: 'Michigan State Spartans',    slug: 'michigan-state',   primary: '#18453B', secondary: '#FFFFFF' },
  { name: 'Minnesota Golden Gophers',   slug: 'minnesota',        primary: '#7A0019', secondary: '#FFB71B' },
  { name: 'Mississippi State Bulldogs', slug: 'mississippi-state',primary: '#660000', secondary: '#FFFFFF' },
  { name: 'Missouri Tigers',            slug: 'missouri',         primary: '#F1B82D', secondary: '#000000' },
  { name: 'NC State Wolfpack',          slug: 'nc-state',         primary: '#CC0000', secondary: '#000000' },
  { name: 'Nebraska Cornhuskers',       slug: 'nebraska',         primary: '#E41C38', secondary: '#000000' },
  { name: 'North Carolina Tar Heels',   slug: 'unc',              primary: '#4B9CD3', secondary: '#FFFFFF' },
  { name: 'Northwestern Wildcats',      slug: 'northwestern',     primary: '#4E2A84', secondary: '#FFFFFF' },
  { name: 'Notre Dame Fighting Irish',  slug: 'notre-dame',       primary: '#0C2340', secondary: '#AE9142' },
  { name: 'Ohio State Buckeyes',        slug: 'ohio-state',       primary: '#BB0000', secondary: '#666666' },
  { name: 'Oklahoma Sooners',           slug: 'oklahoma',         primary: '#841617', secondary: '#FDF9D8' },
  { name: 'Oklahoma State Cowboys',     slug: 'oklahoma-state',   primary: '#FF6600', secondary: '#000000' },
  { name: 'Ole Miss Rebels',            slug: 'ole-miss',         primary: '#CE1126', secondary: '#00205B' },
  { name: 'Oregon Ducks',               slug: 'oregon',           primary: '#154733', secondary: '#FEE123' },
  { name: 'Oregon State Beavers',       slug: 'oregon-state',     primary: '#DC4405', secondary: '#000000' },
  { name: 'Penn State Nittany Lions',   slug: 'penn-state',       primary: '#041E42', secondary: '#FFFFFF' },
  { name: 'Pittsburgh Panthers',        slug: 'pittsburgh',       primary: '#003594', secondary: '#FFB81C' },
  { name: 'Purdue Boilermakers',        slug: 'purdue',           primary: '#CEB888', secondary: '#000000' },
  { name: 'Rutgers Scarlet Knights',    slug: 'rutgers',          primary: '#CC0033', secondary: '#FFFFFF' },
  { name: 'South Carolina Gamecocks',   slug: 'south-carolina',   primary: '#73000A', secondary: '#000000' },
  { name: 'Stanford Cardinal',          slug: 'stanford',         primary: '#8C1515', secondary: '#B6B1A9' },
  { name: 'Syracuse Orange',            slug: 'syracuse',         primary: '#F76900', secondary: '#000E54' },
  { name: 'TCU Horned Frogs',           slug: 'tcu',              primary: '#4D1979', secondary: '#A3A9AC' },
  { name: 'Tennessee Volunteers',       slug: 'tennessee',        primary: '#FF8200', secondary: '#FFFFFF' },
  { name: 'Texas A&M Aggies',           slug: 'texas-am',         primary: '#500000', secondary: '#FFFFFF' },
  { name: 'Texas Longhorns',            slug: 'texas',            primary: '#BF5700', secondary: '#000000' },
  { name: 'Texas Tech Red Raiders',     slug: 'texas-tech',       primary: '#CC0000', secondary: '#000000' },
  { name: 'UCLA Bruins',                slug: 'ucla',             primary: '#2D68C4', secondary: '#F2A900' },
  { name: 'USC Trojans',                slug: 'usc',              primary: '#990000', secondary: '#FFC72C' },
  { name: 'Utah Utes',                  slug: 'utah',             primary: '#CC0000', secondary: '#FFFFFF' },
  { name: 'Vanderbilt Commodores',      slug: 'vanderbilt',       primary: '#866D4B', secondary: '#000000' },
  { name: 'Virginia Cavaliers',         slug: 'virginia',         primary: '#232D4B', secondary: '#E57200' },
  { name: 'Virginia Tech Hokies',       slug: 'virginia-tech',    primary: '#75091D', secondary: '#CF4420' },
  { name: 'Wake Forest Demon Deacons',  slug: 'wake-forest',      primary: '#9E7E38', secondary: '#000000' },
  { name: 'Washington Huskies',         slug: 'washington',       primary: '#33006F', secondary: '#E8D3A2' },
  { name: 'Washington State Cougars',   slug: 'washington-state', primary: '#981E32', secondary: '#5E6A71' },
  { name: 'Wisconsin Badgers',          slug: 'wisconsin',        primary: '#C5050C', secondary: '#FFFFFF' },
];

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

  function applySchool(school: typeof D1_SCHOOLS[0]) {
    setDisplayName(school.name + ' Tennis');
    setSlug(school.slug + '-tennis');
    setPrimary(school.primary);
    setSecondary(school.secondary);
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

  const filteredSchools = D1_SCHOOLS.filter((s) =>
    s.name.toLowerCase().includes(schoolSearch.toLowerCase())
  );

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
                <div className="p-2 border-b border-slate-100">
                  <input
                    type="text"
                    value={schoolSearch}
                    onChange={(e) => setSchoolSearch(e.target.value)}
                    placeholder="Search schools…"
                    className="w-full px-3 py-2 text-sm focus:outline-none"
                    autoFocus
                  />
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
                      <span className="text-sm text-slate-700">{school.name}</span>
                    </button>
                  ))}
                  {filteredSchools.length === 0 && (
                    <p className="px-4 py-6 text-center text-sm text-slate-400">No schools found. Use Custom mode.</p>
                  )}
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
                <p className="text-white/70 text-xs">Powered by One Point Slam</p>
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
