export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_minmax(0,28rem)] md:py-20 lg:px-8">
      <aside className="hidden md:block">
        <svg viewBox="0 0 400 300" className="w-full max-w-md text-forest" aria-hidden>
          <circle cx="250" cy="150" r="64" fill="#E7B98F" opacity="0.85" />
          <path d="M0 200 L70 150 L120 178 L190 120 L250 165 L310 135 L400 175 V300 H0 Z" fill="currentColor" />
          <path d="M0 238 L90 205 L160 228 L240 196 L320 226 L400 210 V300 H0 Z" fill="#133326" />
        </svg>
        <p className="mt-8 max-w-sm font-display text-2xl leading-snug text-forest">
          One account for booking experiences and, if you host, for running your listings.
        </p>
      </aside>
      <div>{children}</div>
    </div>
  );
}
