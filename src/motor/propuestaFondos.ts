import type {
  Cartola,
  Catalogo,
  Acuerdos,
  ProductoCatalogo,
  SustitucionFondo,
  MetricaConcentracion,
  ResultadoPropuestaFondos,
  Supuestos
} from '../types/domain';
import { evaluarSerie } from './evaluadorSeries';

export const LIMITE_MAX_FONDO_PCT = 40;
export const LIMITE_MAX_AGF_PCT = 60;

// R07: busca el fondo de menor TAC dentro de la misma categoria con igualdad estricta
export function buscarMejorAlternativaCategoria(
  categoria: string,
  montoClp: number,
  cartola: Cartola,
  catalogo: Catalogo,
  acuerdos: Acuerdos
): { producto: ProductoCatalogo; serieCodigo: string; tacPct: number } | null {
  const listaAcuerdos = acuerdos.distribucion ?? acuerdos.acuerdos ?? [];

  const productosCandidatos = catalogo.productos.filter((p) => {
    // Igualdad estricta de categoria
    if (p.categoria !== categoria) return false;
    const agf = p.administradora ?? p.emisor;
    const acuerdo = listaAcuerdos.find(
      (a: any) =>
        (a.agf === agf || a.emisor === agf) &&
        a.estado === 'active' &&
        (!a.vigente_desde || a.vigente_desde <= cartola.corte) &&
        (!a.vigente_hasta || a.vigente_hasta >= cartola.corte)
    );
    return !!acuerdo;
  });

  let mejorOpcion: { producto: ProductoCatalogo; serieCodigo: string; tacPct: number } | null = null;

  for (const prod of productosCandidatos) {
    const prodConAgf: ProductoCatalogo = {
      ...prod,
      administradora: prod.administradora ?? prod.emisor
    };

    for (const serie of prod.series) {
      const evalSerie = evaluarSerie(prodConAgf, serie, montoClp, cartola.cliente, acuerdos, null, cartola.corte);
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

// R07: propuesta de fondos equivalentes, balance de volatilidad y limites de concentracion
export function calcularPropuestaFondos(
  cartola: Cartola,
  catalogo: Catalogo,
  acuerdos: Acuerdos,
  supuestos?: Supuestos
): ResultadoPropuestaFondos {
  let totalIdentificado = 0;
  let costoActualTotal = 0;
  let costoPropuestoTotal = 0;
  const sustituciones: SustitucionFondo[] = [];

  let sumaVolActualPond = 0;
  let sumaVolPropPond = 0;
  let sumaRetActualPond = 0;
  let sumaRetPropPond = 0;

  for (const pos of cartola.posiciones) {
    if (pos.producto === null) continue;

    const prodActual = catalogo.productos.find((p) => p.id === pos.producto);
    if (!prodActual || prodActual.tipo === 'insurance_savings' || prodActual.tipo === 'other') continue;

    const agfActual = prodActual.administradora ?? prodActual.emisor;
    totalIdentificado += pos.monto_clp;

    let tacActual = 0;
    if (prodActual.tipo !== 'time_deposit' && prodActual.tipo !== 'cash') {
      const serieObj = prodActual.series.find((s) => s.codigo === pos.serie);
      tacActual = serieObj ? serieObj.tac_pct : 0;
    }

    const costoActualPos = Math.round(pos.monto_clp * (tacActual / 100));
    costoActualTotal += costoActualPos;

    // Supuestos de volatilidad y retorno bruto de la categoria
    const catSupuesto = (supuestos?.categorias as any)?.[prodActual.categoria];
    const volCat = catSupuesto?.volatilidad_pct ?? 0;
    const retBrutoCat = catSupuesto?.retorno_real_bruto_pct ?? catSupuesto?.retorno_real_pct ?? 0;

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

    sumaVolActualPond += pos.monto_clp * volCat;
    sumaVolPropPond += pos.monto_clp * volCat;
    sumaRetActualPond += pos.monto_clp * retBrutoCat;
    sumaRetPropPond += pos.monto_clp * retBrutoCat;
  }

  // Evaluacion de limites de diversificacion
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

  const volActualPonderada = totalIdentificado > 0 ? Number((sumaVolActualPond / totalIdentificado).toFixed(2)) : 0;
  const volPropuestaPonderada = totalIdentificado > 0 ? Number((sumaVolPropPond / totalIdentificado).toFixed(2)) : 0;

  return {
    sustituciones,
    totalIdentificadoClp: totalIdentificado,
    costoActualAnualClp: costoActualTotal,
    costoPropuestoAnualClp: costoPropuestoTotal,
    ahorroTotalAnualClp: ahorroTotal,
    tacActualPonderadaPct: tacActualPonderada,
    tacPropuestaPonderadaPct: tacPropuestaPonderada,
    volatilidadActualPonderadaPct: volActualPonderada,
    volatilidadPropuestaPonderadaPct: volPropuestaPonderada,
    concentracionPorFondo,
    concentracionPorAgf,
    alertasConcentracion
  } as any;
}
