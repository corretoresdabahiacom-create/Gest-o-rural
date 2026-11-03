export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="ag-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2c643d" /><stop offset="1" stopColor="#0f2a1a" /></linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#ag-bg)" />
      <LogoMark />
    </svg>
  )
}
export function LogoMark() {
  return (
    <g>
      <path d="M92 150c8 78 70 108 126 96l10 34c-82 20-150-36-136-130z" fill="#f3e9d2" />
      <path d="M420 150c-8 78-70 108-126 96l-10 34c82 20 150-36 136-130z" fill="#f3e9d2" />
      <ellipse cx="170" cy="266" rx="34" ry="15" transform="rotate(-18 170 266)" fill="#e7d9b8" />
      <ellipse cx="342" cy="266" rx="34" ry="15" transform="rotate(18 342 266)" fill="#e7d9b8" />
      <path d="M192 236c0-20 128-20 128 0l-12 104c-5 44-26 74-52 74s-47-30-52-74z" fill="#f3e9d2" />
      <circle cx="226" cy="296" r="10" fill="#14301f" />
      <circle cx="286" cy="296" r="10" fill="#14301f" />
      <ellipse cx="256" cy="378" rx="40" ry="26" fill="#d39a4a" />
      <circle cx="240" cy="378" r="6" fill="#14301f" />
      <circle cx="272" cy="378" r="6" fill="#14301f" />
    </g>
  )
}
