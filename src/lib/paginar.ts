/**
 * Supabase devuelve como mucho 1.000 filas por petición («max rows»), sin avisar de que hay más.
 * Pide páginas seguidas hasta que llega una vacía; `pagina` recibe el rango de filas (incluido) a pedir.
 */
export async function todas<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>, tam = 1000) {
  const out: T[] = [];
  for (;;) {
    const { data, error } = await pagina(out.length, out.length + tam - 1);
    if (error) throw error;
    // Se avanza por lo recibido, no por `tam`: si el servidor tiene un límite menor, no se salta filas.
    if (!data?.length) return out;
    out.push(...data);
  }
}
