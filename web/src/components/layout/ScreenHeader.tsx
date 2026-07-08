// Cabecalho da area principal no desktop (titulo + acao a direita). No mobile
// esse papel e do TopBar, entao fica escondido abaixo de lg.
export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 hidden items-end justify-between gap-5 lg:flex">
      <div>
        <h1 className="text-[30px] font-extrabold tracking-[-0.02em]">{title}</h1>
        {subtitle && <div className="mt-1 text-[14px] text-text-2">{subtitle}</div>}
      </div>
      {action && <div className="flex items-center gap-2.5">{action}</div>}
    </div>
  );
}
