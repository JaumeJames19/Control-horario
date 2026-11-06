import { createFileRoute } from "@tanstack/react-router";
import { avisosHandler } from "@/lib/avisos-handler";

/** Ruta que llama el programador de tareas (las rutas /api/public/* son las únicas que admite). */
export const Route = createFileRoute("/api/public/avisos")({
  server: { handlers: { GET: avisosHandler, POST: avisosHandler } },
});
