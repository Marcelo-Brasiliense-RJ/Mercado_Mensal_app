const tones = {
  pos: "bg-pos-soft text-pos",
  warn: "bg-warn-soft text-warn",
  neg: "bg-neg-soft text-neg",
  brand: "bg-brand-soft text-brand",
  neutral: "bg-card-2 text-text-3",
} as const;

export function Chip({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof tones;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[5px] text-xs font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
