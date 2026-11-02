import type {
  Cartola,
  Catalogo,
  Acuerdos,
  ProductoCatalogo,
  SustitucionFondo,
  MetricaConcentracion,
  ResultadoPropuestaFondos
} from '../types/domain';
import { evaluarSerie } from './evaluadorSeries';

// Limites maximos regulatorios y de diversificacion (R07)
export const LIMITE_MAX_FONDO_PCT = 40;
export const LIMITE_MAX_AGF_PCT = 60;

// R07: busca en el catalogo el activo de menor TAC dentro de la misma categoria con serie elegible
export function buscarMejorAlternativaCategoria(
  categoria: string,
  montoClp: number,
  cartola: Cartola,
  catalogo: Catalogo,
  acuerdos: Acuerdos
): { producto: ProductoCatalogo; serieCodigo: string; tacPct: number } | null {
  const listaAcuerdos = acuerdos.distribucion ?? acuerdos.acuerdos ?? [];

  // R01: filtrar productos de administradoras que mantengan acuerdo vigente de distribucion
  const productosCandidatos = catalogo.productos.filter((p) => {
    const agf = p.administradora ?? p.emisor;
    const catMatches = p.categoria === categoria || p.categoria.startsWith(categoria) || categoria.startsWith(p.categoria);
    if (!catMatches) return false;

    const acuerdo = listaAcuerdos.find((a: any) => (a.agf === agf || a.emisor === agf) && a.estado === 'active');
    return !!acuerdo;
  });

  let mejorOpcion: { producto: ProductoCatalogo; serieCodigo: string; tacPct: number } | null = null;

  for (const prod of productosCandidatos) {
    const prodConAgf: ProductoCatalogo = {
      ...prod,
      administradora: prod.administradora ?? prod.emisor
    };

    for (const serie of prod.series) {
      // R04: verificar elegibilidad estricta de la serie candidata para este cliente y monto
      const evalSerie = evaluarSerie(prodConAgf, serie, montoClp, cartola.cliente, acuerdos, null);
      if (evalSerie.estado === 'eligible') {
        if (!mejorOpcion || evalSerie.tac_pct < mejorOpcion.tacPct) {
          mejorOpcion = {
            producto: prodConAgf,
            serieCodigo: evalSerie.codigo,
            tacPct: evalSerie.tac_pct
          };
        }
      }
    }
  }

  return mejorOpcion;
}

// R07: genera propuesta de sustitucion por fondos de menor costo y valida concentracion
export function calcularPropuestaFondos(
  cartola: Cartola,
  catalogo: Catalogo,
  acuerdos: Acuerdos
): ResultadoPropuestaFondos {
  let totalIdentificado = 0;
  let costoActualTotal = 0;
  let costoPropuestoTotal = 0;
  const sustituciones: SustitucionFondo[] = [];

  // Mapeo inicial de posiciones identificadas
  for (const pos of cartola.posiciones) {
    if (pos.producto === null) continue;

    const prodActual = catalogo.productos.find((p) => p.id === pos.producto);
    if (!prodActual) continue;

    const agfActual = prodActual.administradora ?? prodActual.emisor;
    totalIdentificado += pos.monto_clp;

    // TAC actual segun serie o 0% para depositos/efectivo
    let tacActual = 0;
    if (prodActual.tipo !== 'time_deposit' && prodActual.tipo !== 'cash') {
      const serieObj = prodActual.series.find((s) => s.codigo === pos.serie);
      tacActual = serieObj ? serieObj.tac_pct : 0;
    }
    const costoActualPos = Math.round(pos.monto_clp * (tacActual / 100));
    costoActualTotal += costoActualPos;

    // Buscar si existe un fondo mas eficiente en la misma categoria
    const mejor = buscarMejorAlternativaCategoria(
      prodActual.categoria,
      pos.monto_clp,
      cartola,
      catalogo,
      acuerdos
    );

    if (mejor && mejor.tacPct < tacActual) {
      const ahorroBps = Math.round((tacActual - mejor.tacPct) * 100);
      const costoPropuestoPos = Math.round(pos.monto_clp * (mejor.tacPct / 100));
      const ahorroClp = costoActualPos - costoPropuestoPos;

      costoPropuestoTotal += costoPropuestoPos;
      sustituciones.push({
        idProductoActual: prodActual.id,
        nombreProductoActual: prodActual.nombre,
        categoria: prodActual.categoria,
        montoClp: pos.monto_clp,
        serieActual: pos.serie,
        tacActualPct: tacActual,
        idProductoSugerido: mejor.producto.id,
        nombreProductoSugerido: mejor.producto.nombre,
        serieSugerida: mejor.serieCodigo,
        tacSugeridaPct: mejor.tacPct,
        ahorroBps,
        ahorroAnualClp: ahorroClp,
        agfSugerida: mejor.producto.administradora ?? mejor.producto.emisor,
        esMismoProducto: mejor.producto.id === prodActual.id
      });
    } else {
      // Si la posicion actual ya es optima o no tiene reemplazo mas economico
      costoPropuestoTotal += costoActualPos;
      sustituciones.push({
        idProductoActual: prodActual.id,
        nombreProductoActual: prodActual.nombre,
        categoria: prodActual.categoria,
        montoClp: pos.monto_clp,
        serieActual: pos.serie,
        tacActualPct: tacActual,
        idProductoSugerido: prodActual.id,
        nombreProductoSugerido: prodActual.nombre,
        serieSugerida: pos.serie ?? 'N/A',
        tacSugeridaPct: tacActual,
        ahorroBps: 0,
        ahorroAnualClp: 0,
        agfSugerida: agfActual,
        esMismoProducto: true
      });
    }
  }

  // Evaluacion de limites de diversificacion sobre la cartera propuesta
  const acumFondo: Record<string, { nombre: string; monto: number }> = {};
  const acumAgf: Record<string, { nombre: string; monto: number }> = {};

  for (const s of sustituciones) {
    if (!acumFondo[s.idProductoSugerido]) {
      acumFondo[s.idProductoSugerido] = { nombre: s.nombreProductoSugerido, monto: 0 };
    }
    acumFondo[s.idProductoSugerido].monto += s.montoClp;

    if (!acumAgf[s.agfSugerida]) {
      acumAgf[s.agfSugerida] = { nombre: s.agfSugerida, monto: 0 };
    }
    acumAgf[s.agfSugerida].monto += s.montoClp;
  }

  const alertasConcentracion: string[] = [];
  const concentracionPorFondo: Record<string, MetricaConcentracion> = {};
  const concentracionPorAgf: Record<string, MetricaConcentracion> = {};

  for (const [id, data] of Object.entries(acumFondo)) {
    const pct = totalIdentificado > 0 ? Number(((data.monto / totalIdentificado) * 100).toFixed(2)) : 0;
    const excede = pct > LIMITE_MAX_FONDO_PCT;
    concentracionPorFondo[id] = {
      nombre: data.nombre,
      montoClp: data.monto,
      participacionPct: pct,
      excedeLimite: excede,
      limiteMaxPct: LIMITE_MAX_FONDO_PCT
    };
    if (excede) {
      alertasConcentracion.push(
        `Concentración excesiva en fondo ${data.nombre}: ${pct}% (Límite máximo permitido: ${LIMITE_MAX_FONDO_PCT}%)`
      );
    }
  }

  for (const [agf, data] of Object.entries(acumAgf)) {
    const pct = totalIdentificado > 0 ? Number(((data.monto / totalIdentificado) * 100).toFixed(2)) : 0;
    const excede = pct > LIMITE_MAX_AGF_PCT;
    concentracionPorAgf[agf] = {
      nombre: agf,
      montoClp: data.monto,
      participacionPct: pct,
      excedeLimite: excede,
      limiteMaxPct: LIMITE_MAX_AGF_PCT
    };
    if (excede) {
      alertasConcentracion.push(
        `Concentración excesiva en AGF ${agf}: ${pct}% (Límite máximo permitido: ${LIMITE_MAX_AGF_PCT}%)`
      );
    }
  }

  const ahorroTotal = costoActualTotal - costoPropuestoTotal;
  const tacActualPonderada = totalIdentificado > 0
    ? Number(((costoActualTotal / totalIdentificado) * 100).toFixed(4))
    : 0;
  const tacPropuestaPonderada = totalIdentificado > 0
    ? Number(((costoPropuestoTotal / totalIdentificado) * 100).toFixed(4))
    : 0;

  return {
    sustituciones,
    totalIdentificadoClp: totalIdentificado,
    costoActualAnualClp: costoActualTotal,
    costoPropuestoAnualClp: costoPropuestoTotal,
    ahorroTotalAnualClp: ahorroTotal,
    tacActualPonderadaPct: tacActualPonderada,
    tacPropuestaPonderadaPct: tacPropuestaPonderada,
    concentracionPorFondo,
    concentracionPorAgf,
    alertasConcentracion
  };
}
