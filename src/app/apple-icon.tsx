import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%)',
        }}
      >
        <svg width="128" height="128" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="29" stroke="#ffffff" strokeWidth="3.5" fill="none" />
          <path d="M14 18 Q28 32 14 46" stroke="#ffffff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.45" />
          <path d="M50 18 Q36 32 50 46" stroke="#ffffff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.45" />
          <polygon points="36,8 24,34 32,34 28,56 42,28 34,28" fill="#ffffff" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
