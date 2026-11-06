/**
 * Manejador compartido del cron de recordatorios push (olvidos de fichar, descansos, solicitudes pendientes).
 * Valida `Authorization: Bearer <LOVABLE_CRON_SECRET>` con authenticateCronRequest; no repite avisos.
 */
export async function avisosHandler({ request }: { request: Request }) {
  const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
  const denegado = await authenticateCronRequest(request);
  if (denegado) return denegado;
  const { recordatorios } = await import("@/lib/recordatorios.server");
  return Response.json(await recordatorios());
}
