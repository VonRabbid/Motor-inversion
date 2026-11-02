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

export interface CandidatoFondo {
  producto: ProductoCatalogo;
  serieCodigo: string;
  tacPct: number;
  agf: string;
  esMismoProducto: boolean;
}

// Obtiene todas las opciones elegibles para una categoria ordenadas por costo y preferencia de fondo
export function obtenerCandidatosCategoria(
  categoria: string,
  montoClp: number,
  cartola: Cartola,
  catalogo: Catalogo,
  acuerdos: Acuerdos,
  idProductoActual?: string
): CandidatoFondo[] {
  const listaAcuerdos = acuerdos.distribucion ?? acuerdos.acuerdos ?? [];

  const productosCandidatos = catalogo.productos.filter((p) => {
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

  const candidatos: CandidatoFondo[] = [];

  for (const prod of productosCandidatos) {
    const prodConAgf: ProductoCatalogo = {
      ...prod,
      administradora: prod.administradora ?? prod.emisor
    };

    for (const serie of prod.series) {
      const evalSerie = evaluarSerie(prodConAgf, serie, montoClp, cartola.cliente, acuerdos, null, cartola.corte);
      if (evalSerie.estado === 'eligible') {
        candidatos.push({
          producto: prodConAgf,
          serieCodigo: evalSerie.codigo,
          tacPct: evalSerie.tac_pct,
          agf: prodConAgf.administradora ?? prodConAgf.emisor,
          esMismoProducto: prod.id === idProductoActual
        });
      }
    }
  }

  // Orden: menor TAC; ante igualdad de TAC, preferir otra serie del mismo fondo
  candidatos.sort((a, b) => {
    if (Math.abs(a.tacPct - b.tacPct) > 0.0001) {
      return a.tacPct - b.tacPct;
    }
    if (a.esMismoProducto && !b.esMismoProducto) return -1;
    if (!a.esMismoProducto && b.esMismoProducto) return 1;
    return a.producto.id.localeCompare(b.producto.id);
  });

  return candidatos;
}

// R07: busca el fondo de menor TAC dentro de la misma categoria con igualdad estricta
export function buscarMejorAlternativaCategoria(
  categoria: string,
  montoClp: number,
  cartola: Cartola,
  catalogo: Catalogo,
  acuerdos: Acuerdos
): { producto: ProductoCatalogo; serieCodigo: string; tacPct: number } | null {
  const candidatos = obtenerCandidatosCategoria(categoria, montoClp, cartola, catalogo, acuerdos);
  if (candidatos.length === 0) return null;
  const mejor = candidatos[0];
  return {
    producto: mejor.producto,
    serieCodigo: mejor.serieCodigo,
    tacPct: mejor.tacPct
  };
}

// R07: propuesta de fondos equivalentes respetando limites dinamicos y calculando metricas de riesgo y retorno
export function calcularPropuestaFondos(
  cartola: Cartola,
  catalogo: Catalogo,
  acuerdos: Acuerdos,
  supuestos?: Supuestos
): ResultadoPropuestaFondos {
  const limiteMaxFondoPct = supuestos?.limites?.max_por_fondo_pct ?? LIMITE_MAX_FONDO_PCT;
  const limiteMaxAgfPct = supuestos?.limites?.max_por_agf_pct ?? LIMITE_MAX_AGF_PCT;

  let totalIdentificado = 0;
  for (const pos of cartola.posiciones) {
    if (pos.producto === null) continue;
    const prod = catalogo.productos.find((p) => p.id === pos.producto);
    if (!prod || prod.tipo === 'insurance_savings' || prod.tipo === 'other') continue;
    totalIdentificado += pos.monto_clp;
  }

  const maxFondoMontoClp = totalIdentificado * (limiteMaxFondoPct / 100);
  const maxAgfMontoClp = totalIdentificado * (limiteMaxAgfPct / 100);

  let costoActualTotal = 0;
  let costoPropuestoTotal = 0;
  const sustituciones: SustitucionFondo[] = [];

  let sumaVolActualPond = 0;
  let sumaVolPropPond = 0;
  let sumaRetActualPond = 0;
  let sumaRetPropPond = 0;

  const acumFondo: Record<string, { nombre: string; monto: number }> = {};
  const acumAgf: Record<string, { nombre: string; monto: number }> = {};

  for (const pos of cartola.posiciones) {
    if (pos.producto === null) continue;

    const prodActual = catalogo.productos.find((p) => p.id === pos.producto);
    if (!prodActual || prodActual.tipo === 'insurance_savings' || prodActual.tipo === 'other') continue;

    const agfActual = prodActual.administradora ?? prodActual.emisor;

    let tacActual = 0;
    if (prodActual.tipo !== 'time_deposit' && prodActual.tipo !== 'cash') {
      const serieObj = prodActual.series.find((s) => s.codigo === pos.serie);
      tacActual = serieObj ? serieObj.tac_pct : 0;
    }

    const costoActualPos = Math.round(pos.monto_clp * (tacActual / 100));
    costoActualTotal += costoActualPos;

    const catSupuesto = (supuestos?.categorias as any)?.[prodActual.categoria];
    const volCatActual = catSupuesto?.volatilidad_pct ?? 0;
    const retBrutoCatActual = catSupuesto?.retorno_real_bruto_pct ?? catSupuesto?.retorno_real_pct ?? 0;

    // Obtener candidatos de menor a mayor TAC
    const candidatos = obtenerCandidatosCategoria(
      prodActual.categoria,
      pos.monto_clp,
      cartola,
      catalogo,
      acuerdos,
      prodActual.id
    );

    const candidatosMasBaratos = candidatos.filter((c) => c.tacPct < tacActual);

    let elegido: CandidatoFondo | null = null;

    if (candidatosMasBaratos.length > 0) {
      // Buscar la alternativa mas barata que respete los limites maximos de fondo y AGF
      const candidatoSinExceso = candidatosMasBaratos.find((cand) => {
        const montoFondoFuturo = (acumFondo[cand.producto.id]?.monto ?? 0) + pos.monto_clp;
        const montoAgfFuturo = (acumAgf[cand.agf]?.monto ?? 0) + pos.monto_clp;
        return montoFondoFuturo <= maxFondoMontoClp && montoAgfFuturo <= maxAgfMontoClp;
      });

      // Si existe uno que respete limites se asigna; de lo contrario se opta por el mas economico de la categoria
      elegido = candidatoSinExceso ?? candidatosMasBaratos[0];
    }

    if (elegido) {
      const ahorroBps = Math.round((tacActual - elegido.tacPct) * 100);
      const costoPropuestoPos = Math.round(pos.monto_clp * (elegido.tacPct / 100));
      const ahorroClp = costoActualPos - costoPropuestoPos;

      costoPropuestoTotal += costoPropuestoPos;
      sustituciones.push({
        idProductoActual: prodActual.id,
        nombreProductoActual: prodActual.nombre,
        categoria: prodActual.categoria,
        montoClp: pos.monto_clp,
        serieActual: pos.serie,
        tacActualPct: tacActual,
        idProductoSugerido: elegido.producto.id,
        nombreProductoSugerido: elegido.producto.nombre,
        serieSugerida: elegido.serieCodigo,
        tacSugeridaPct: elegido.tacPct,
        ahorroBps,
        ahorroAnualClp: ahorroClp,
        agfSugerida: elegido.agf,
        esMismoProducto: elegido.producto.id === prodActual.id
      });

      if (!acumFondo[elegido.producto.id]) {
        acumFondo[elegido.producto.id] = { nombre: elegido.producto.nombre, monto: 0 };
      }
      acumFondo[elegido.producto.id].monto += pos.monto_clp;

      if (!acumAgf[elegido.agf]) {
        acumAgf[elegido.agf] = { nombre: elegido.agf, monto: 0 };
      }
      acumAgf[elegido.agf].monto += pos.monto_clp;

      const catSugerida = (supuestos?.categorias as any)?.[elegido.producto.categoria];
      const volCatSugerida = catSugerida?.volatilidad_pct ?? volCatActual;
      const retBrutoCatSugerida = catSugerida?.retorno_real_bruto_pct ?? catSugerida?.retorno_real_pct ?? retBrutoCatActual;

      sumaVolPropPond += pos.monto_clp * volCatSugerida;
      sumaRetPropPond += pos.monto_clp * retBrutoCatSugerida;
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

      if (!acumFondo[prodActual.id]) {
        acumFondo[prodActual.id] = { nombre: prodActual.nombre, monto: 0 };
      }
      acumFondo[prodActual.id].monto += pos.monto_clp;

      if (!acumAgf[agfActual]) {
        acumAgf[agfActual] = { nombre: agfActual, monto: 0 };
      }
      acumAgf[agfActual].monto += pos.monto_clp;

      sumaVolPropPond += pos.monto_clp * volCatActual;
      sumaRetPropPond += pos.monto_clp * retBrutoCatActual;
    }

    sumaVolActualPond += pos.monto_clp * volCatActual;
    sumaRetActualPond += pos.monto_clp * retBrutoCatActual;
  }

  // Evaluacion de limites de diversificacion
  const alertasConcentracion: string[] = [];
  const concentracionPorFondo: Record<string, MetricaConcentracion> = {};
  const concentracionPorAgf: Record<string, MetricaConcentracion> = {};

  for (const [id, data] of Object.entries(acumFondo)) {
    const pct = totalIdentificado > 0 ? Number(((data.monto / totalIdentificado) * 100).toFixed(2)) : 0;
    const excede = pct > limiteMaxFondoPct;
    concentracionPorFondo[id] = {
      nombre: data.nombre,
      montoClp: data.monto,
      participacionPct: pct,
      excedeLimite: excede,
      limiteMaxPct: limiteMaxFondoPct
    };
    if (excede) {
      alertasConcentracion.push(
        `Concentración excesiva en fondo ${data.nombre}: ${pct}% (Límite máximo permitido: ${limiteMaxFondoPct}%)`
      );
    }
  }

  for (const [agf, data] of Object.entries(acumAgf)) {
    const pct = totalIdentificado > 0 ? Number(((data.monto / totalIdentificado) * 100).toFixed(2)) : 0;
    const excede = pct > limiteMaxAgfPct;
    concentracionPorAgf[agf] = {
      nombre: agf,
      montoClp: data.monto,
      participacionPct: pct,
      excedeLimite: excede,
      limiteMaxPct: limiteMaxAgfPct
    };
    if (excede) {
      alertasConcentracion.push(
        `Concentración excesiva en AGF ${agf}: ${pct}% (Límite máximo permitido: ${limiteMaxAgfPct}%)`
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
  const retBrutoActualPonderado = totalIdentificado > 0 ? Number((sumaRetActualPond / totalIdentificado).toFixed(4)) : 0;
  const retBrutoPropuestoPonderado = totalIdentificado > 0 ? Number((sumaRetPropPond / totalIdentificado).toFixed(4)) : 0;

  const retRealNetoActual = Number((retBrutoActualPonderado - tacActualPonderada).toFixed(4));
  const retRealNetoPropuesto = Number((retBrutoPropuestoPonderado - tacPropuestaPonderada).toFixed(4));

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
    retornoBrutoPonderadoActualPct: retBrutoActualPonderado,
    retornoBrutoPonderadoPropuestoPct: retBrutoPropuestoPonderado,
    retornoRealNetoActualPct: retRealNetoActual,
    retornoRealNetoPropuestoPct: retRealNetoPropuesto,
    concentracionPorFondo,
    concentracionPorAgf,
    alertasConcentracion
  };
}
