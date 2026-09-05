type P = { size?: number; className?: string };
const base = (size = 24) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const BoxIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M3 11h18" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
export const ListIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
  </svg>
);
export const ChartIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
  </svg>
);
export const ChevronRight = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M9 18l6-6-6-6" /></svg>
);
export const ChevronLeftIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M15 18l-6-6 6-6" /></svg>
);
export const SunIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const MoonIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
);
export const SearchIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
);
export const PlusIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>
);
export const CheckIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M20 6L9 17l-5-5" /></svg>
);
export const TelegramIcon = ({ size, className }: P) => (
  <svg width={size ?? 24} height={size ?? 24} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M21.9 4.3l-3.3 15.6c-.25 1.1-.9 1.37-1.83.85l-5-3.7-2.42 2.33c-.27.27-.5.5-1 .5l.36-5.1L17.98 6.2c.4-.36-.09-.56-.62-.2L6.87 12.6l-4.9-1.53c-1.07-.34-1.09-1.07.22-1.58l19.16-7.4c.9-.33 1.68.2 1.55 1.2z" />
  </svg>
);
export const RefreshIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v5h-5" />
  </svg>
);
export const CopyIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
export const ReceiptIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 9a2 2 0 0 1 2-2h2l1.2-1.6a1 1 0 0 1 .8-.4h6a1 1 0 0 1 .8.4L17 7h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="12.5" r="3.3" />
  </svg>
);
export const UsersIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="9" cy="8.5" r="3.3" />
    <path d="M2.5 20c0-3.5 2.9-5.4 6.5-5.4" />
    <circle cx="17" cy="9.5" r="2.8" />
    <path d="M13.5 15c3.4 0 6 1.8 6 5" />
  </svg>
);
export const BarcodeIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 6V5a1 1 0 0 1 1-1h2M18 4h2a1 1 0 0 1 1 1v1M21 18v1a1 1 0 0 1-1 1h-2M6 20H4a1 1 0 0 1-1-1v-1" />
    <path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" />
  </svg>
);
export const MicIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21M9 21h6" />
  </svg>
);
