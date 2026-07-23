'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="text-5xl select-none">⚠️</div>
        <div>
          <h1 className="text-xl font-black text-slate-900">Something went wrong</h1>
          <p className="text-slate-500 text-sm mt-2">
            An unexpected error occurred. Try refreshing the page, or contact{' '}
            <a
              href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@onepointbowl.com'}`}
              className="underline"
            >
              support
            </a>{' '}
            if the problem continues.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={reset}
            className="px-6 py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors"
          >
            Try again
          </button>
          <a href="/" className="text-sm text-slate-400 hover:text-slate-600 underline underline-offset-2">
            Back to home
          </a>
        </div>
      </div>
    </div>
  );
}
