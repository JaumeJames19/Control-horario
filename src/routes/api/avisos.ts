import { createFileRoute } from "@tanstack/react-router";
import { avisosHandler } from "@/lib/avisos-handler";

export const Route = createFileRoute("/api/avisos")({
  server: { handlers: { GET: avisosHandler, POST: avisosHandler } },
});
