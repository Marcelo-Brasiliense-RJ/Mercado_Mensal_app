export function AvatarInitial({
  name,
  size = 44,
}: {
  name: string;
  size?: number;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-[13px] bg-brand-soft font-extrabold text-brand"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
