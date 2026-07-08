import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui/icons";

export function TopBar({
  title,
  subtitle,
  back,
  right,
  className = "",
}: {
  title: string;
  subtitle?: string;
  back?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`sticky top-0 z-20 flex h-[52px] items-center border-b border-border bg-card px-3 ${className}`}
    >
      <div className="flex w-10 justify-start">
        {back && (
          <Link
            href={back}
            aria-label="Voltar"
            className="grid h-10 w-10 place-items-center text-text-2"
          >
            <ChevronLeftIcon size={22} />
          </Link>
        )}
      </div>
      <div className="flex-1 text-center">
        <div className="text-[15px] font-bold leading-tight">{title}</div>
        {subtitle && (
          <div className="text-[11px] leading-tight text-text-3">{subtitle}</div>
        )}
      </div>
      <div className="flex w-10 justify-end">{right}</div>
    </header>
  );
}
