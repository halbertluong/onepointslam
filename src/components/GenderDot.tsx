'use client';

const GENDER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  male:       { bg: 'bg-blue-100',   text: 'text-blue-600',   label: '♂' },
  female:     { bg: 'bg-pink-100',   text: 'text-pink-600',   label: '♀' },
  non_binary: { bg: 'bg-purple-100', text: 'text-purple-600', label: '⚧' },
};

export default function GenderDot({ gender, size = 'md' }: { gender?: string; size?: 'sm' | 'md' }) {
  if (!gender) return null;
  const g = gender.toLowerCase().replace('-', '_').replace(' ', '_');
  const style = GENDER_STYLES[g] ?? { bg: 'bg-slate-100', text: 'text-slate-500', label: gender[0].toUpperCase() };
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-bold shrink-0 ${style.bg} ${style.text} ${size === 'sm' ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-xs'}`}>
      {style.label}
    </span>
  );
}
