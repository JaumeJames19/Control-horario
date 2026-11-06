-- La migración 0012_auditoria_final quedó registrada en el diario sin llegar a ejecutarse
-- (la base de datos se quedó en 0011). El migrador de Drizzle aplica primero ese archivo
-- pendiente, en orden de diario; este solo fuerza esa aplicación y no añade nada.
NOTIFY pgrst, 'reload schema';