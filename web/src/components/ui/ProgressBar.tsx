export function ProgressBar({
  ratio,
  tone = "auto",
  height = 6,
}: {
  ratio: number;
  tone?: "auto" | "pos" | "warn" | "brand" | "neg";
  height?: number;
}) {
  const w = Math.max(4, Math.min(100, ratio * 100));
  const color =
    tone === "auto"
      ? ratio < 0.5
        ? "var(--warn)"
        : "var(--pos)"
      : `var(--${tone})`;
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-card-2"
      style={{ height }}
    >
      <div
        className="rounded-full transition-all"
        style={{ width: `${w}%`, height, background: color }}
      />
    </div>
  );
}
