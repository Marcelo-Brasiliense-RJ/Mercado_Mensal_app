import {
  Camera,
  ChartColumn,
  Check,
  ChevronLeft,
  ChevronRight as LChevronRight,
  Copy,
  Heart,
  ListChecks,
  MapPinOff,
  Mic,
  Moon,
  Package,
  PackagePlus,
  Plus,
  Receipt,
  RefreshCw,
  ScanBarcode,
  Search,
  Sun,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

// Icones do app: Lucide (traco uniforme, arredondado), com os mesmos nomes de antes
// para nao mexer em quem usa. Animacao fica por conta de quem usa (classes .ic-*).
type P = { size?: number; className?: string };
const de = (I: LucideIcon, traco = 2) => {
  const C = ({ size = 24, className }: P) => <I size={size} strokeWidth={traco} className={className} aria-hidden />;
  return C;
};

export const BoxIcon = de(Package);
export const ListIcon = de(ListChecks);
export const ChartIcon = de(ChartColumn);
export const ChevronRight = de(LChevronRight);
export const ChevronLeftIcon = de(ChevronLeft);
export const SunIcon = de(Sun);
export const MoonIcon = de(Moon);
export const SearchIcon = de(Search);
export const PlusIcon = de(Plus);
export const CheckIcon = de(Check, 2.5);
export const RefreshIcon = de(RefreshCw);
export const CopyIcon = de(Copy);
export const ReceiptIcon = de(Receipt);
export const UsersIcon = de(Users);
export const TagIcon = de(Tag);
export const BarcodeIcon = de(ScanBarcode);
export const MicIcon = de(Mic);
export const HeartIcon = de(Heart);
export const CameraIcon = de(Camera);

// Adicionar item: pacote com "+" (botao flutuante).
export const AddItemIcon = ({ size = 24, className }: P & { contraste?: string }) => (
  <PackagePlus size={size} strokeWidth={2.1} className={className} aria-hidden />
);

// Localizacao: preenchida = ligada e funcionando; riscada = desligada.
export const PinIcon = ({ size = 24, className, ligado }: P & { ligado: boolean }) =>
  ligado ? (
    // mesmo desenho do MapPin do Lucide, preenchido e com o furo na cor do fundo
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" fill="var(--card, #fff)" stroke="none" />
    </svg>
  ) : (
    <MapPinOff size={size} strokeWidth={2} className={className} aria-hidden />
  );

export const TelegramIcon = ({ size, className }: P) => (
  <svg width={size ?? 24} height={size ?? 24} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M21.9 4.3l-3.3 15.6c-.25 1.1-.9 1.37-1.83.85l-5-3.7-2.42 2.33c-.27.27-.5.5-1 .5l.36-5.1L17.98 6.2c.4-.36-.09-.56-.62-.2L6.87 12.6l-4.9-1.53c-1.07-.34-1.09-1.07.22-1.58l19.16-7.4c.9-.33 1.68.2 1.55 1.2z" />
  </svg>
);

