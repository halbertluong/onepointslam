import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="text-6xl font-black text-slate-200 select-none">404</div>
        <div>
          <h1 className="text-xl font-black text-slate-900">Page not found</h1>
          <p className="text-slate-500 text-sm mt-2">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors"
        >
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
