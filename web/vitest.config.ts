import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config minima para os testes puros (ex.: src/lib/nfce.test.ts). O alias "@"
// espelha o tsconfig para que imports como "@/lib/supabase/client" resolvam.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
