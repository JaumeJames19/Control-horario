import { useSyncExternalStore } from "react";

/**
 * Castellano y catalán. Las claves son el texto en castellano tal como está en los componentes:
 * `t("Entrada")` devuelve "Entrada" en castellano y la traducción en catalán. Lo que falte sale en castellano.
 */
export type Idioma = "es" | "ca";
const CLAVE = "idioma";

function leer(): Idioma {
  try {
    const g = localStorage.getItem(CLAVE);
    if (g === "ca" || g === "es") return g;
    return navigator.language.toLowerCase().startsWith("ca") ? "ca" : "es";
  } catch { return "es"; }
}

let actual: Idioma = typeof window === "undefined" ? "es" : leer();
const oyentes = new Set<() => void>();
const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };

export const idioma = () => actual;
export function setIdioma(i: Idioma) {
  actual = i;
  try { localStorage.setItem(CLAVE, i); document.documentElement.lang = i; } catch { /* sin almacenamiento */ }
  oyentes.forEach((f) => f());
}
/** Re-renderiza el componente al cambiar de idioma y devuelve el idioma actual. */
export const useIdioma = () => useSyncExternalStore(suscribir, () => actual, () => "es" as Idioma);
export const locale = () => (actual === "ca" ? "ca-ES" : "es-ES");

export function t(es: string): string {
  if (actual !== "ca") return es;
  const d = CA[es];
  if (d !== undefined) return d;
  for (const [re, ca] of PATRONES) if (re.test(es)) return es.replace(re, ca);
  return es;
}
/** Con variables: tf("Pedir {n} días", { n: 3 }). */
export const tf = (es: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), t(es));

const PATRONES: [RegExp, string][] = [
  [/^No ha fichado la entrada \(horario: (.+)\)\.$/, "No ha fitxat l'entrada (horari: $1)."],
  [/^Sigue con la jornada abierta pasada la hora de salida \((.+)\)\. ¿Olvidó fichar la salida\?$/, "Continua amb la jornada oberta passada l'hora de sortida ($1). Ha oblidat fitxar la sortida?"],
  [/^Lleva más de (.+) h esta semana\.$/, "Porta més de $1 h aquesta setmana."],
  [/^No ha descansado 12 h desde la jornada anterior \((.+) h\)\.$/, "No ha descansat 12 h des de la jornada anterior ($1 h)."],
  [/^Lleva (\d+) días seguidos trabajando: falta el descanso semanal\.$/, "Porta $1 dies seguits treballant: falta el descans setmanal."],
];

const CA: Record<string, string> = {
  // Genéricos
  "Entrada": "Entrada", "Pausa": "Pausa", "Espera": "Espera", "Vuelta al trabajo": "Tornada a la feina", "Salida": "Sortida",
  "Salir": "Sortir", "Entrar": "Entrar", "Guardar": "Desar", "Cancelar": "Cancel·lar", "Quitar": "Treure", "Añadir": "Afegir", "Aprobar": "Aprovar", "Rechazar": "Rebutjar", "Anular": "Anul·lar", "Volver": "Tornar", "Listo": "Fet", "Continuar": "Continuar",
  "Pendiente": "Pendent", "Aprobada": "Aprovada", "Rechazada": "Rebutjada", "Anulada": "Anul·lada", "Pendientes": "Pendents", "Todas": "Totes",
  "Vacaciones": "Vacances", "Permiso retribuido": "Permís retribuït", "Baja médica": "Baixa mèdica", "Otra ausencia": "Altra absència",
  "Trabajador": "Treballador", "Tipo": "Tipus", "Desde": "Des de", "Hasta": "Fins a", "Nombre": "Nom", "Usuario": "Usuari", "Día": "Dia", "Entrada ": "Entrada ",
  "fichar": "fitxar", "historial": "historial", "ausencias": "absències", "equipo": "equip", "inspección": "inspecció",
  // Login / PIN / 2FA / kiosco
  "Ficha tu jornada": "Fitxa la teva jornada", "Entra con tu usuario y tu PIN.": "Entra amb el teu usuari i el teu PIN.", "PIN de 6 números": "PIN de 6 números", "Entrando…": "Entrant…",
  "Para obtener acceso o recuperar tu PIN, habla con el encargado.": "Per obtenir accés o recuperar el PIN, parla amb l'encarregat.",
  "El usuario debe tener al menos 3 letras o números.": "L'usuari ha de tenir almenys 3 lletres o números.", "El PIN debe tener 6 números.": "El PIN ha de tenir 6 números.",
  "Demasiados intentos fallidos. Espera 15 minutos o habla con el encargado.": "Massa intents fallits. Espera 15 minuts o parla amb l'encarregat.", "Usuario o PIN incorrectos.": "Usuari o PIN incorrectes.",
  "Elige tu PIN": "Tria el teu PIN", "PIN nuevo": "PIN nou", "Repite el PIN": "Repeteix el PIN", "Guardar PIN": "Desar PIN",
  "Ese PIN es demasiado fácil. Evita números repetidos o seguidos.": "Aquest PIN és massa fàcil. Evita números repetits o seguits.", "Los dos PIN no coinciden.": "Els dos PIN no coincideixen.", "No se pudo cambiar el PIN. Inténtalo de nuevo.": "No s'ha pogut canviar el PIN. Torna-ho a provar.",
  "PIN que te han dado es temporal. Pon uno nuevo que solo sepas tú.": "PIN que t'han donat és temporal. Posa'n un de nou que només sàpigues tu.", "El": "El",
  "Código de seguridad": "Codi de seguretat", "Escribe el código de 6 números que muestra tu app de autenticación.": "Escriu el codi de 6 números que mostra la teva app d'autenticació.",
  "Como encargado, además del PIN necesitas un código que cambia cada 30 segundos. Escanea este QR con Google Authenticator, Microsoft Authenticator o la app de contraseñas del iPhone:": "Com a encarregat, a més del PIN necessites un codi que canvia cada 30 segons. Escaneja aquest QR amb Google Authenticator, Microsoft Authenticator o l'app de contrasenyes de l'iPhone:",
  "Si no puedes escanearlo, introduce esta clave:": "Si no pots escanejar-lo, introdueix aquesta clau:", "Comprobando…": "Comprovant…", "Escribe los 6 números que muestra la app.": "Escriu els 6 números que mostra l'app.", "Código incorrecto o caducado. Prueba con el siguiente.": "Codi incorrecte o caducat. Prova amb el següent.",
  "No se pudo comprobar el segundo factor.": "No s'ha pogut comprovar el segon factor.", "No se pudo preparar el código de seguridad.": "No s'ha pogut preparar el codi de seguretat.",
  "Hazlo ahora: hasta que actives el código, cualquiera que sepa tu PIN podría registrar su propia app de autenticación.": "Fes-ho ara: fins que activis el codi, qualsevol que sàpiga el teu PIN podria registrar la seva pròpia app d'autenticació.",
  "Fichar": "Fitxar", "PIN": "PIN", "registrada a las": "registrada a les", "Volver al trabajo": "Tornar a la feina", "Registro de jornada": "Registre de jornada", "supera el máximo anual": "supera el màxim anual", "Cerrar": "Tancar", "Cada hora cuenta": "Cada hora compta",
  "Demasiados intentos fallidos. Espera 15 minutos o avisa al encargado.": "Massa intents fallits. Espera 15 minuts o avisa l'encarregat.", "Esta tablet no está en la red de la empresa.": "Aquesta tauleta no és a la xarxa de l'empresa.",
  "Tu PIN es temporal: entra antes en la app con tu móvil y cámbialo.": "El teu PIN és temporal: entra abans a l'app amb el mòbil i canvia'l.", "Tu cuenta está desactivada. Habla con el encargado.": "El teu compte està desactivat. Parla amb l'encarregat.",
  "Tienes una jornada anterior sin cerrar. Pide la corrección desde la app.": "Tens una jornada anterior sense tancar. Demana la correcció des de l'app.", "No se pudo fichar. Inténtalo otra vez.": "No s'ha pogut fitxar. Torna-ho a provar.",
  // App: fichar
  "Jornada sin cerrar: no suma horas": "Jornada sense tancar: no suma hores", "Trabajando": "Treballant", "En pausa": "En pausa", "hoy": "avui", "En espera": "En espera", "de trabajo hoy": "de feina avui", "Jornada cerrada": "Jornada tancada", "Sin fichar hoy": "Sense fitxar avui",
  "Empezar otra jornada": "Començar una altra jornada", "Empezar la jornada": "Començar la jornada", "Terminar la jornada": "Acabar la jornada", "Hacer pausa": "Fer pausa", "Espera (carga, descarga, obra)": "Espera (càrrega, descàrrega, obra)",
  "Terminar la espera": "Acabar l'espera", "Terminar la pausa": "Acabar la pausa", "Hoy": "Avui", "Aún no has fichado hoy.": "Encara no has fitxat avui.", "Hoy trabajo a distancia": "Avui treballo a distància", "a distancia": "a distància", "corregido": "corregit",
  "Te olvidaste de fichar la salida del": "Vas oblidar fitxar la sortida del", "Para volver a fichar, solicita la corrección con tu hora real de salida. El encargado la aprobará.": "Per tornar a fitxar, sol·licita la correcció amb la teva hora real de sortida. L'encarregat l'aprovarà.", "Solicitar corrección": "Sol·licitar correcció",
  "Jornadas sin cerrar: no suman horas": "Jornades sense tancar: no sumen hores", "Solicita una corrección si falta la salida.": "Sol·licita una correcció si falta la sortida.",
  "Tienes una jornada sin cerrar. Solicita la corrección con tu hora de salida real.": "Tens una jornada sense tancar. Sol·licita la correcció amb la teva hora de sortida real.", "No se pudo fichar. Revisa la conexión.": "No s'ha pogut fitxar. Revisa la connexió.",
  // App: historial / equipo
  "Mis jornadas": "Les meves jornades", "Equipo": "Equip", "Excel gestoría": "Excel gestoria", "CSV": "CSV", "PDF": "PDF", "Solicitar jornada": "Sol·licitar jornada", "Solicitar": "Sol·licitar",
  "Total del mes:": "Total del mes:", "de": "de", "previstas": "previstes", "días": "dies", "Horas extra:": "Hores extra:", "Espera:": "Espera:", "Descansos incumplidos:": "Descansos incomplerts:", "Año": "Any", "Vacaciones:": "Vacances:", "días a elegir": "dies a triar",
  "Sin fichajes este mes.": "Sense fitxatges aquest mes.", "Crear trabajador": "Crear treballador", "Histórico completo (Excel)": "Històric complet (Excel)", "desactivado": "desactivat", "trabajando": "treballant", "en pausa": "en pausa", "en espera": "en espera", "aviso": "avís", "avisos": "avisos",
  "conductor": "conductor", "conforme": "conforme", "discrepa": "discrepa", "sin cerrar el mes": "sense tancar el mes", "Discrepancia del mes:": "Discrepància del mes:", "Cambiar PIN": "Canviar PIN", "Editar": "Editar", "Desactivar": "Desactivar", "Reactivar": "Reactivar",
  "Cerrada": "Tancada", "En curso": "En curs", "Sin cerrar": "Sense tancar", "Trabajador desactivado": "Treballador desactivat", "Trabajador reactivado": "Treballador reactivat", "No se pudo cambiar el acceso.": "No s'ha pogut canviar l'accés.",
  "Registro de jornada ": "Registre de jornada ", "PDF del mes": "PDF del mes", "baja": "baixa", "Acceso de solo lectura para la Inspección de Trabajo: fichajes efectivos con sus originales, correcciones, ausencias y conformidad mensual de cada trabajador. Se conserva 4 años.": "Accés només de lectura per a la Inspecció de Treball: fitxatges efectius amb els originals, correccions, absències i conformitat mensual de cada treballador. Es conserva 4 anys.",
  "Información sobre tus datos": "Informació sobre les teves dades", "Registro de jornada obligatorio (art. 34.9 del Estatuto de los Trabajadores).": "Registre de jornada obligatori (art. 34.9 de l'Estatut dels Treballadors).",
  "Empresa Demo registra la hora de entrada, pausas y salida de cada jornada para cumplir la obligación legal de registro horario. No se recoge tu ubicación.": "Empresa Demo registra l'hora d'entrada, pauses i sortida de cada jornada per complir l'obligació legal de registre horari. No es recull la teva ubicació.",
  "Los registros se conservan 4 años y están a disposición tuya, de tus representantes y de la Inspección de Trabajo. Solo tú y el encargado podéis consultarlos.": "Els registres es conserven 4 anys i són a la teva disposició, dels teus representants i de la Inspecció de Treball. Només tu i l'encarregat podeu consultar-los.",
  "Puedes pedir a la empresa el acceso a tus datos o la rectificación de un fichaje erróneo (desde «Solicitar corrección»).": "Pots demanar a l'empresa l'accés a les teves dades o la rectificació d'un fitxatge erroni (des de «Sol·licitar correcció»).", "Entendido": "Entesos",
  "Solicitud enviada al encargado": "Sol·licitud enviada a l'encarregat", "PIN cambiado": "PIN canviat",
  // Ausencias
  "al año": "a l'any", "cierre empresa": "tancament empresa", "pedidos": "demanats", "a elegir": "a triar", "pend.": "pend.",
  "Días laborables (de lunes a viernes, sin festivos).": "Dies laborables (de dilluns a divendres, sense festius).", "La empresa cierra": "L'empresa tanca", "del": "del", "al": "al", "y": "i", ": esos días ya son vacaciones para todos.": ": aquests dies ja són vacances per a tothom.", "Este año no hay cierres de empresa anotados.": "Aquest any no hi ha tancaments d'empresa anotats.",
  "Registrar ausencia": "Registrar absència", "Pedir vacaciones o ausencia": "Demanar vacances o absència", "Las vacaciones se piden desde aquí: el encargado las aprueba y queda constancia de la fecha de la solicitud y de la decisión.": "Les vacances es demanen des d'aquí: l'encarregat les aprova i queda constància de la data de la sol·licitud i de la decisió.",
  "Comentario (opcional)": "Comentari (opcional)", "Esas fechas no consumen vacaciones: son fin de semana, festivo o cierre de la empresa.": "Aquestes dates no consumeixen vacances: són cap de setmana, festiu o tancament de l'empresa.",
  "Registrar": "Registrar", "Pedir": "Demanar", "día laborable": "dia laborable", "días laborables": "dies laborables", "día": "dia", "laborables": "laborables",
  "Por aprobar": "Per aprovar", "Motivo (obligatorio para rechazar)": "Motiu (obligatori per rebutjar)", "Quién falta": "Qui falta", "No hay ausencias aprobadas a partir de hoy.": "No hi ha absències aprovades a partir d'avui.", "Saldo de vacaciones": "Saldo de vacances",
  "Mis ausencias": "Les meves absències", "Aún no has pedido ninguna ausencia.": "Encara no has demanat cap absència.", "Año anterior": "Any anterior", "Año siguiente": "Any següent", "Pedida el": "Demanada el", "con esta,": "amb aquesta,", "tendría": "tindria", "días a elegir en": "dies a triar el",
  "Personal mínimo: si la apruebas faltarían más de": "Personal mínim: si l'aproves faltarien més de", "el": "el",
  "La fecha final es anterior a la inicial.": "La data final és anterior a la inicial.", "Ya hay una ausencia en esas fechas.": "Ja hi ha una absència en aquestes dates.", "Esos días la empresa está cerrada: ya son vacaciones para todos.": "Aquests dies l'empresa està tancada: ja són vacances per a tothom.",
  "No quedan suficientes días de vacaciones para esas fechas.": "No queden prou dies de vacances per a aquestes dates.", "No se pudo guardar la ausencia.": "No s'ha pogut desar l'absència.", "Ausencia registrada": "Absència registrada", "Para rechazar escribe el motivo.": "Per rebutjar escriu el motiu.", "No se pudo guardar.": "No s'ha pogut desar.",
  "Ausencia aprobada": "Absència aprovada", "Ausencia rechazada": "Absència rebutjada", "Solicitud anulada": "Sol·licitud anul·lada", "Supera los": "Supera els", "días disponibles de": "dies disponibles de", "en": "el", "; quedará registrado igualmente.": "; quedarà registrat igualment.", "Solo te quedan": "Només et queden",
  // Calendario
  "enero": "gener", "febrero": "febrer", "marzo": "març", "abril": "abril", "mayo": "maig", "junio": "juny", "julio": "juliol", "agosto": "agost", "septiembre": "setembre", "octubre": "octubre", "noviembre": "novembre", "diciembre": "desembre",
  "Festivo": "Festiu", "Cierre de la empresa": "Tancament de l'empresa", "Vacaciones aprobadas": "Vacances aprovades", "Pendientes de aprobar": "Pendents d'aprovar", "Permiso o baja": "Permís o baixa", "L": "Dl", "M": "Dt", "X": "Dc", "J": "Dj", "V": "Dv", "S": "Ds", "D": "Dg",
  // Cierre de mes
  "Diste tu conformidad": "Vas donar la teva conformitat", "Anotaste una discrepancia": "Vas anotar una discrepància", "a las horas de": "a les hores de", "a las": "a les", "El mes está cerrado: para cambiar algo, habla con el encargado.": "El mes està tancat: per canviar res, parla amb l'encarregat.",
  "Revisa tus horas de": "Revisa les teves hores de", "Si todo está bien, da tu conformidad. Si algo no cuadra, explícalo: quedará anotado junto al registro.": "Si tot està bé, dona la teva conformitat. Si alguna cosa no quadra, explica-ho: quedarà anotat al costat del registre.",
  "Tienes {n} jornada sin cerrar este mes: cuenta 0 h. Pide la corrección antes de cerrar si quieres que se compute.": "Tens {n} jornada sense tancar aquest mes: compta 0 h. Demana la correcció abans de tancar si vols que es computi.",
  "Tienes {n} jornadas sin cerrar este mes: cuentan 0 h. Pide las correcciones antes de cerrar si quieres que se computen.": "Tens {n} jornades sense tancar aquest mes: compten 0 h. Demana les correccions abans de tancar si vols que es computin.",
  "Tienes {n} solicitud de corrección pendiente de decidir. Si la apruebas el encargado después, las horas de este mes cambiarán.": "Tens {n} sol·licitud de correcció pendent de decidir. Si l'encarregat l'aprova després, les hores d'aquest mes canviaran.",
  "Tienes {n} solicitudes de corrección pendientes de decidir. Si las aprueba el encargado después, las horas de este mes cambiarán.": "Tens {n} sol·licituds de correcció pendents de decidir. Si l'encarregat les aprova després, les hores d'aquest mes canviaran.",
  "¿Qué no es correcto?": "Què no és correcte?", "Estoy conforme": "Hi estic conforme", "No estoy conforme": "No hi estic conforme", "Guardar discrepancia y cerrar": "Desar discrepància i tancar", "No se pudo cerrar el mes.": "No s'ha pogut tancar el mes.", "Explica en qué no estás de acuerdo.": "Explica en què no estàs d'acord.", "Mes cerrado": "Mes tancat",
  // Correcciones
  "Solicitudes de corrección": "Sol·licituds de correcció", "Sin solicitudes.": "Sense sol·licituds.", "Mi jornada": "La meva jornada", "Solicitada por": "Sol·licitada per", "Anulación": "Anul·lació", "Original:": "Original:", "fichaje omitido": "fitxatge omès", "Decidida por": "Decidida per",
  "Corrección aprobada": "Correcció aprovada", "Corrección rechazada": "Correcció rebutjada", "No se pudo decidir: comprueba la secuencia y el motivo. No se ha aplicado ningún cambio.": "No s'ha pogut decidir: comprova la seqüència i el motiu. No s'ha aplicat cap canvi.", "No se pudieron cargar las solicitudes.": "No s'han pogut carregar les sol·licituds.",
  "Los originales se conservan. Solo se aplicará después de la aprobación del encargado.": "Els originals es conserven. Només s'aplicarà després de l'aprovació de l'encarregat.", "Tipo de fichaje": "Tipus de fitxatge", "Fecha y hora propuesta (España)": "Data i hora proposada (Espanya)", "Solicitar anulación": "Sol·licitar anul·lació", "Quitar propuesta": "Treure proposta",
  "Añadir fichaje omitido": "Afegir fitxatge omès", "Motivo obligatorio": "Motiu obligatori", "Enviar solicitud": "Enviar sol·licitud", "No se pudo solicitar. Revisa las fechas, el motivo y los fichajes.": "No s'ha pogut sol·licitar. Revisa les dates, el motiu i els fitxatges.",
  "Dos fichajes tendrían la misma hora o quedarían desordenados. Revisa las horas.": "Dos fitxatges tindrien la mateixa hora o quedarien desordenats. Revisa les hores.",
  "Con ese cambio la secuencia no cuadra (por ejemplo, dos entradas seguidas o una salida sin entrada).": "Amb aquest canvi la seqüència no quadra (per exemple, dues entrades seguides o una sortida sense entrada).",
  "Ese mes ya está cerrado: pide la corrección al encargado.": "Aquest mes ja està tancat: demana la correcció a l'encarregat.", "El tiempo de espera solo lo pueden fichar los conductores.": "El temps d'espera només el poden fitxar els conductors.",
  "Falta la fecha y hora, o es posterior a ahora.": "Falta la data i hora, o és posterior a ara.", "Has propuesto dos cambios para el mismo fichaje.": "Has proposat dos canvis per al mateix fitxatge.", "Esta solicitud ya estaba decidida.": "Aquesta sol·licitud ja estava decidida.", "Escribe el motivo.": "Escriu el motiu.",
  // Trabajadores
  "Editar trabajador": "Editar treballador", "Cambiar PIN de": "Canviar PIN de", "PIN temporal de 6 números. El trabajador tendrá que cambiarlo al entrar.": "PIN temporal de 6 números. El treballador l'haurà de canviar en entrar.", "Acceso gestionado por el encargado.": "Accés gestionat per l'encarregat.",
  "Conductor (puede fichar tiempo de espera)": "Conductor (pot fitxar temps d'espera)", "Inspección de Trabajo (solo lectura de todo, con código de seguridad; no ficha)": "Inspecció de Treball (només lectura de tot, amb codi de seguretat; no fitxa)", "PIN temporal (6 números)": "PIN temporal (6 números)", "Guardando…": "Desant…",
  "PIN temporal puesto. Comunícalo en persona: tendrá que cambiarlo al entrar.": "PIN temporal posat. Comunica'l en persona: l'haurà de canviar en entrar.", "Trabajador guardado": "Treballador desat", "No se pudo guardar. Comprueba los datos y el usuario.": "No s'ha pogut desar. Comprova les dades i l'usuari.",
  // Avisos push
  "Avisos en el móvil": "Avisos al mòbil", "Activar avisos": "Activar avisos", "Activados en este móvil": "Activats en aquest mòbil", "Este navegador no admite notificaciones.": "Aquest navegador no admet notificacions.",
  "En iPhone, añade la app a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde ahí para poder activar los avisos.": "A l'iPhone, afegeix l'app a la pantalla d'inici (Compartir → Afegir a la pantalla d'inici) i obre-la des d'allà per poder activar els avisos.",
  "Te avisaremos de las solicitudes pendientes y de los olvidos de fichar del equipo.": "T'avisarem de les sol·licituds pendents i dels oblits de fitxar de l'equip.", "Te avisaremos si olvidas fichar, si no has descansado lo que toca y cuando el encargado decida tus solicitudes.": "T'avisarem si oblides fitxar, si no has descansat el que toca i quan l'encarregat decideixi les teves sol·licituds.",
  "Avisos activados en este móvil": "Avisos activats en aquest mòbil", "Avisos desactivados": "Avisos desactivats", "No se pudieron activar los avisos.": "No s'han pogut activar els avisos.", "No se pudieron desactivar.": "No s'han pogut desactivar.", "Has denegado las notificaciones. Actívalas en los ajustes del navegador.": "Has denegat les notificacions. Activa-les a la configuració del navegador.",
  // Ajustes
  "Ajustes": "Configuració", "Horas por semana": "Hores per setmana", "Máximo anual": "Màxim anual", "Hora de entrada": "Hora d'entrada", "Hora de salida": "Hora de sortida", "Vacaciones al año (días laborables, cierre incluido)": "Vacances a l'any (dies laborables, tancament inclòs)", "Personal mínimo: avisar si faltan más de": "Personal mínim: avisar si falten més de",
  "IP de la oficina para la tablet (vacío = desde cualquier sitio)": "IP de l'oficina per a la tauleta (buit = des de qualsevol lloc)", "Guardar ajustes": "Desar configuració", "Ajustes guardados": "Configuració desada", "No se pudieron guardar los ajustes.": "No s'ha pogut desar la configuració.", "La hora de salida debe ser posterior a la de entrada.": "L'hora de sortida ha de ser posterior a la d'entrada.",
  "Tablet del almacén: abre": "Tauleta del magatzem: obre", "en la tablet y añádela a la pantalla de inicio.": "a la tauleta i afegeix-la a la pantalla d'inici.", "Festivos": "Festius", "Fecha del festivo": "Data del festiu", "Nombre del festivo": "Nom del festiu", "No se pudo guardar el festivo.": "No s'ha pogut desar el festiu.",
  "Horarios especiales": "Horaris especials", "Jornada intensiva de verano, horario de un día concreto… Manda sobre el horario general en esas fechas: cambia la hora de entrada y salida de los avisos y las horas teóricas del día.": "Jornada intensiva d'estiu, horari d'un dia concret… Mana sobre l'horari general en aquestes dates: canvia l'hora d'entrada i sortida dels avisos i les hores teòriques del dia.",
  "Laborables": "Laborables", "Todos los laborables": "Tots els laborables", "Lunes": "Dilluns", "Martes": "Dimarts", "Miércoles": "Dimecres", "Jueves": "Dijous", "Viernes": "Divendres", "Sábado": "Dissabte", "Domingo": "Diumenge", "Horas del día": "Hores del dia", "Añadir horario": "Afegir horari", "No se pudo guardar el horario.": "No s'ha pogut desar l'horari.",
  "Nombre del horario": "Nom de l'horari", "Nombre (p. ej. Intensiva de verano)": "Nom (p. ex. Intensiva d'estiu)",
  "Cierres de la empresa": "Tancaments de l'empresa", "Vacaciones colectivas (las tres semanas de agosto, Navidad): cuentan como vacaciones de todos y se descuentan del saldo de cada uno.": "Vacances col·lectives (les tres setmanes d'agost, Nadal): compten com a vacances de tothom i es descompten del saldo de cadascú.",
  "Nombre del cierre": "Nom del tancament", "Nombre (p. ej. Vacaciones de agosto)": "Nom (p. ex. Vacances d'agost)", "Añadir cierre": "Afegir tancament", "Se solapa con otro cierre.": "Se solapa amb un altre tancament.", "No se pudo guardar el cierre.": "No s'ha pogut desar el tancament.", "No se pudo quitar el cierre.": "No s'ha pogut treure el tancament.",
  "Últimos accesos": "Últims accessos", "tablet": "tauleta", "app": "app", "PIN incorrecto": "PIN incorrecte",
  // Añadidos en la auditoría final
  "Reintentar": "Torna-ho a provar", "Cambiar mi PIN": "Canviar el meu PIN", "Elige un PIN nuevo de 6 números que solo sepas tú.": "Tria un PIN nou de 6 números que només sàpigues tu.",
  "¿Quitar el horario «{n}»?": "Treure l'horari «{n}»?", "¿Quitar el cierre «{n}»?": "Treure el tancament «{n}»?", "Esta acción no se puede deshacer.": "Aquesta acció no es pot desfer.", "Sí, quitar": "Sí, treure",
  "El año {n} aún no tiene festivos: añádelos (y los cierres de empresa y horarios especiales) antes de enero para que el horario teórico y los avisos sean correctos.": "L'any {n} encara no té festius: afegeix-los (i els tancaments d'empresa i horaris especials) abans de gener perquè l'horari teòric i els avisos siguin correctes.",
  "Solo el encargado puede crear trabajadores.": "Només l'encarregat pot crear treballadors.", "Solo el encargado puede cambiar PINs.": "Només l'encarregat pot canviar PINs.", "Usuario inválido.": "Usuari invàlid.",
  "No se pudo crear: comprueba que el usuario no exista.": "No s'ha pogut crear: comprova que l'usuari no existeixi.", "Trabajador creado, pero no se pudo poner el PIN: ponlo con «Cambiar PIN».": "Treballador creat, però no s'ha pogut posar el PIN: posa'l amb «Canviar PIN».",
  "No se pudo cambiar el PIN.": "No s'ha pogut canviar el PIN.", "PIN cambiado, pero no se pudo marcar como temporal.": "PIN canviat, però no s'ha pogut marcar com a temporal.", "Falta PIN_PEPPER en el servidor": "Falta PIN_PEPPER al servidor",
  "Usuario duplicado": "Usuari duplicat", "Datos inválidos": "Dades invàlides", "Solo encargado": "Només l'encarregat", "No puede desactivarse": "No es pot desactivar", "Trabajador inexistente": "Treballador inexistent",
  // Errores de carga
  // Calendario laboral por año
  "Festivo nacional": "Festiu nacional", "Festivo autonómico": "Festiu autonòmic", "Festivo local": "Festiu local",
  "pendiente de confirmación oficial": "pendent de confirmació oficial",
  "Local pendiente de confirmación oficial": "Local pendent de confirmació oficial",
  "festivo local pendiente de confirmación oficial; la fecha puede cambiar.": "festiu local pendent de confirmació oficial; la data pot canviar.",
  "Festivos que caen en sábado: {n}.": "Festius que cauen en dissabte: {n}.", "Se compensan cubriendo {n} días de puente, que no restan vacaciones.": "Es compensen cobrint {n} dies de pont, que no resten vacances.",
  "Ya hay un festivo ese día.": "Ja hi ha un festiu aquest dia.", "El texto no es un JSON válido.": "El text no és un JSON vàlid.", "No se pudo cargar el calendario:": "No s'ha pogut carregar el calendari:",
  "Calendario {a} cargado: {f} festivos y {c} cierres ({d} días laborables de cierre).": "Calendari {a} carregat: {f} festius i {c} tancaments ({d} dies laborables de tancament).",
  "Compensar los festivos que caen en sábado con los puentes": "Compensar els festius que cauen en dissabte amb els ponts",
  "Si se activa, los días de puente se cubren con esos festivos y no restan vacaciones. Desactivado hasta confirmarlo con la gestoría.": "Si s'activa, els dies de pont es cobreixen amb aquests festius i no resten vacances. Desactivat fins a confirmar-ho amb la gestoria.",
  "Tipo de festivo": "Tipus de festiu", "Pendiente de confirmación oficial": "Pendent de confirmació oficial", "Confirmar": "Confirmar",
  "Cae en sábado: se compensa con un puente": "Cau en dissabte: es compensa amb un pont",
  "¿Quitar el festivo «{n}»?": "Treure el festiu «{n}»?", "Cargar el calendario de un año": "Carregar el calendari d'un any", "Calendario en JSON": "Calendari en JSON", "Cargar calendario": "Carregar calendari", "Sí, cargar": "Sí, carregar",
  "Pega el JSON del calendario laboral (anio, festivos y cierres_empresa). Sustituye los festivos de ese año y los cierres que empiezan ese año, y comprueba los días laborables indicados.": "Enganxa el JSON del calendari laboral (anio, festivos i cierres_empresa). Substitueix els festius d'aquell any i els tancaments que comencen aquell any, i comprova els dies laborables indicats.",
  "¿Cargar este calendario? Sustituye los festivos y cierres de ese año.": "Carregar aquest calendari? Substitueix els festius i tancaments d'aquell any.",
  "puente": "pont", "Es un puente (se puede compensar con un festivo en sábado)": "És un pont (es pot compensar amb un festiu en dissabte)",
  // Vacaciones de la plantilla (encargado)
  "Vacaciones de la plantilla": "Vacances de la plantilla", "Mes anterior": "Mes anterior", "Mes siguiente": "Mes següent", "Ausentes": "Absents", "No hay trabajadores activos.": "No hi ha treballadors actius.",
  "más de {n} ausentes": "més de {n} absents", "Saldo de cada trabajador": "Saldo de cada treballador", "cierre": "tancament", "disfrutados": "gaudits", "programados": "programats", "pendientes": "pendents", "libres": "lliures",
  "Días laborables de vacaciones. Disfrutados: aprobados hasta hoy; programados: aprobados a partir de mañana.": "Dies laborables de vacances. Gaudits: aprovats fins avui; programats: aprovats a partir de demà.",
  "No ha pedido vacaciones ni ausencias este año.": "No ha demanat vacances ni absències aquest any.", "Ver su calendario": "Veure el seu calendari",
  // Días de otros años
  "Incluye {n} días de otros años: {m}.": "Inclou {n} dies d'altres anys: {m}.", "Días de otros años en {a}": "Dies d'altres anys el {a}", "(cupo: {n} días)": "(quota: {n} dies)",
  "p. ej. Pendientes del año anterior": "p. ex. Pendents de l'any anterior", "Días": "Dies", "Motivo": "Motiu", "Sábado de apertura": "Dissabte d'obertura",
  // Fichaje desactivable y horas laborables
  "Fichaje activado": "Fitxatge activat", "Fichaje desactivado": "Fitxatge desactivat", "Fichaje desactivado: la app se usa solo para vacaciones": "Fitxatge desactivat: l'app només s'utilitza per a les vacances",
  "Mientras esté desactivado nadie puede fichar (tampoco en la tablet), los trabajadores solo ven Vacaciones y no se envían recordatorios de fichaje.": "Mentre estigui desactivat ningú no pot fitxar (tampoc a la tauleta), els treballadors només veuen Vacances i no s'envien recordatoris de fitxatge.",
  "¿Desactivar el fichaje?": "Desactivar el fitxatge?", "¿Activar el fichaje para toda la plantilla?": "Activar el fitxatge per a tota la plantilla?", "Sí, desactivar": "Sí, desactivar", "Sí, activar": "Sí, activar",
  "Desactivar fichaje": "Desactivar fitxatge", "Activar fichaje": "Activar fitxatge", "Se puede volver a cambiar en cualquier momento.": "Es pot tornar a canviar en qualsevol moment.",
  "El fichaje aún no está activado. De momento la app solo se usa para las vacaciones.": "El fitxatge encara no està activat. De moment l'app només s'utilitza per a les vacances.",
  "Horas laborables": "Hores laborables", "Lunes a viernes: {d} días": "Dilluns a divendres: {d} dies", "Sábados de apertura: {s}": "Dissabtes d'obertura: {s}", "Total de apertura": "Total d'obertura", "Año {a}": "Any {a}",
  "Lunes a viernes, sin sus vacaciones ni ausencias": "Dilluns a divendres, sense les seves vacances ni absències",
  "En rojo y con ⚠, quien supera el máximo anual del convenio ({n} h). El horario de apertura no puede ser la jornada de cada trabajador: habrá que repartirlo por turnos.": "En vermell i amb ⚠, qui supera el màxim anual del conveni ({n} h). L'horari d'obertura no pot ser la jornada de cada treballador: caldrà repartir-lo per torns.",
  "Los sábados van por turnos: cuentan en el total de la empresa, pero aún no en las horas de cada trabajador.": "Els dissabtes van per torns: compten en el total de l'empresa, però encara no en les hores de cada treballador.",
  "No se pudo cargar el equipo.": "No s'ha pogut carregar l'equip.", "No se pudieron cargar los fichajes.": "No s'han pogut carregar els fitxatges.", "No se pudo cargar el mes.": "No s'ha pogut carregar el mes.", "No se pudieron cargar los avisos.": "No s'han pogut carregar els avisos.", "No se pudo cargar el calendario.": "No s'ha pogut carregar el calendari.", "No se pudo comprobar el aviso de privacidad.": "No s'ha pogut comprovar l'avís de privacitat.", "No se pudo registrar el aviso.": "No s'ha pogut registrar l'avís.",
};
