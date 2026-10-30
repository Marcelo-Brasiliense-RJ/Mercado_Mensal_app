"use client";

// Interruptor liga/desliga (estilo iPhone), para opcoes de um toque.
export function Interruptor({
  ligado,
  onChange,
  disabled,
  rotulo,
}: {
  ligado: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={disabled}
      onClick={() => onChange(!ligado)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        ligado ? "bg-pos" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-[left] ${
          ligado ? "left-[22px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}
