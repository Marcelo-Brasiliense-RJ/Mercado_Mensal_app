// Versao do deploy no ar. Nunca guardada em cache: o app consulta para saber se esta velho.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { versao: process.env.NEXT_PUBLIC_VERSAO ?? "" },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
