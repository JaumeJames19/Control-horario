import { TIPOS, compute, dur, hm } from "@/lib/fichaje";
import { groupByDay, toEv, type Fila, type Perfil } from "./data";

/** Genera el informe mensual en PDF: una sección por empleado con sus días y total. */
export async function exportarPdf(mes: string, filas: Fila[], perfiles: Perfil[]) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF();
  const [y, m] = mes.split("-").map(Number);
  const titulo = new Date(y ?? 0, (m ?? 1) - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  doc.setFontSize(16);
  doc.text("Empresa Demo · Registro de jornada", 14, 16);
  doc.setFontSize(11);
  doc.text(`Mes: ${titulo}`, 14, 23);
  let yPos = 30;
  const ids = [...new Set(filas.map((f) => f.user_id))];
  for (const id of ids) {
    const p = perfiles.find((x) => x.id === id);
    const dias = groupByDay(filas.filter((f) => f.user_id === id)).reverse();
    let total = 0;
    const body = dias.map(([dia, fs]) => {
      const { worked: w, unclosed } = compute(fs.map(toEv));
      total += w;
      return [
        new Date(dia + "T12:00").toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "2-digit" }),
        fs.map((f) => `${TIPOS[f.tipo]} ${hm(f.at)}${f.editado && f.original_at ? ` (original ${hm(f.original_at)})` : ""}`).join(", "),
        unclosed ? "Sin cerrar · 0 h" : dur(w),
        fs.some((f) => f.editado) ? "Sí" : "",
      ];
    });
    body.push(["", "TOTAL", dur(total), ""]);
    doc.setFontSize(12);
    doc.text(`${p?.nombre ?? "—"} (@${p?.username ?? ""})`, 14, yPos);
    autoTable(doc, {
      startY: yPos + 3,
      head: [["Día", "Fichajes", "Horas", "Corregido"]],
      body,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 78, 121] },
    });
    yPos = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? yPos) + 14;
    if (yPos > 260) { doc.addPage(); yPos = 20; }
  }
  if (!ids.length) doc.text("Sin fichajes este mes.", 14, 32);
  doc.text("Firma del trabajador: ____________________     Firma de la empresa: ____________________", 14, Math.min(yPos + 6, 285));
  doc.save(`fichajes-${mes}.pdf`);
}
