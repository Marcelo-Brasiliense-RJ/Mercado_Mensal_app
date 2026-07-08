import { BoxIcon } from "./icons";

// Marca do app (quadrado da marca com o icone). Evita dependencia de PNG em
// public. ponytail: trocar por <Image src="/icon-512.png"> quando os icones do
// PWA forem adicionados.
export function BrandMark({
  size = 42,
  radius = 12,
}: {
  size?: number;
  radius?: number;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center bg-brand text-brand-ink"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <BoxIcon size={Math.round(size * 0.5)} />
    </div>
  );
}
