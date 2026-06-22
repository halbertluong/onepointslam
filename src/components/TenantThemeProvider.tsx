'use client';

interface TenantThemeProviderProps {
  primaryColor: string;
  secondaryColor: string;
  children: React.ReactNode;
}

export default function TenantThemeProvider({
  primaryColor,
  secondaryColor,
  children,
}: TenantThemeProviderProps) {
  return (
    <>
      <style>{`:root { --tenant-primary: ${primaryColor}; --tenant-secondary: ${secondaryColor}; }`}</style>
      {children}
    </>
  );
}
