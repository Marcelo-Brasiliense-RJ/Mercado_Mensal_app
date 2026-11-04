import { Suspense } from "react";
import { LiveloView } from "@/components/ofertas/LiveloView";

export default function LiveloPage() {
  return (
    <Suspense>
      <LiveloView />
    </Suspense>
  );
}
