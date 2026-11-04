import { Suspense } from "react";
import { OfertasView } from "@/components/ofertas/OfertasView";

export default function OfertasPage() {
  return (
    <Suspense>
      <OfertasView />
    </Suspense>
  );
}
