export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-[20px] border border-border bg-card p-[18px] shadow-[0_2px_10px_var(--shadow)] ${className}`}
    >
      {children}
    </div>
  );
}
