// Marca do app: o icone "Cesta do mes" (desenhado no Claude Design, opcao F), o mesmo
// da tela inicial do celular (public/icone.svg).
export function BrandMark({
  size = 42,
  radius = 12,
}: {
  size?: number;
  radius?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- svg pequeno do proprio app
    <img src="/icone.svg" alt="" aria-hidden width={size} height={size} className="shrink-0" style={{ width: size, height: size, borderRadius: radius }} />
  );
}
