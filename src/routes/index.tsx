import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Login } from "@/components/fichaje/Login";
import { FichajeApp } from "@/components/fichaje/App";
import { Kiosco } from "@/components/fichaje/Kiosco";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fichaje Empresa Demo" },
      { name: "description", content: "Ficha tu entrada, pausas y salida en Empresa Demo." },
      { property: "og:title", content: "Fichaje Empresa Demo" },
      { property: "og:description", content: "Ficha tu entrada, pausas y salida en Empresa Demo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  const [kiosco, setKiosco] = useState(false);
  useEffect(() => { setKiosco(new URLSearchParams(window.location.search).has("kiosco")); }, []);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUid(s?.user.id ?? null));
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  if (kiosco) return <Kiosco />;
  if (uid === undefined) return <div className="min-h-screen" />;
  return uid ? <FichajeApp key={uid} uid={uid} /> : <Login />;
}
