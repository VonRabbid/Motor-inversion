import type {
  Cartola,
  Catalogo,
  Acuerdos,
  AcuerdoAGF,
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

type AcumuladoMonto = Record<string, { nombre: string; monto: number }>;

// R01: depositos a plazo y efectivo no requieren acuerdo de AGF
function esProductoSinAgf(producto: Pick<ProductoCatalogo, 'tipo'>): boolean {
  return producto.tipo === 'time_deposit' || producto.tipo === 'cash';
}

function buscarAcuerdoVigente(
  agf: string,
  listaAcuerdos: AcuerdoAGF[],
  fechaCorte: string
): AcuerdoAGF | undefined {
  return listaAcuerdos.find(
    (a) =>
      (a.agf === agf || a.emisor === agf) &&
      a.estado === 'active' &&
      (!a.vigente_desde || a.vigente_desde <= fechaCorte) &&
      (!a.vigente_hasta || a.vigente_hasta >= fechaCorte)
  );
}

function respetaLimitesConcentracion(
  cand: CandidatoFondo,
  montoClp: number,
  acumFondo: AcumuladoMonto,
  acumAgf: AcumuladoMonto,
  maxFondoMontoClp: number,
  maxAgfMontoClp: number
): boolean {
  const montoFondoFuturo = (acumFondo[cand.producto.id]?.monto ?? 0) + montoClp;
  const montoAgfFuturo = (acumAgf[cand.agf]?.monto ?? 0) + montoClp;
  return montoFondoFuturo <= maxFondoMontoClp && montoAgfFuturo <= maxAgfMontoClp;
}

// R07 tercer escalon: reasignacion a una categoria equivalente o de menor volatilidad
function buscarAlternativaMenorVolatilidad(
  prodActual: ProductoCatalogo,
  montoClp: number,
  tacActual: number,
  volCatActual: number,
  cartola: Cartola,
  catalogo: Catalogo,
  acuerdos: Acuerdos,
  supuestos: Supuestos | undefined,
  acumFondo: AcumuladoMonto,
  acumAgf: AcumuladoMonto,
  maxFondoMontoClp: number,
  maxAgfMontoClp: number
): CandidatoFondo | null {
  const listaAcuerdos = acuerdos.distribucion ?? acuerdos.acuerdos ?? [];
  const categoriasSupuestas = supuestos?.categorias ?? {};
  const alternativas: Array<CandidatoFondo & { volatilidadPct: number }> = [];

  for (const prod of catalogo.productos) {
    if (prod.id === prodActual.id) continue;
    if (prod.tipo === 'time_deposit' || prod.tipo === 'cash') continue;
    if (prod.tipo === 'insurance_savings' || prod.tipo === 'other') continue;

    const volCatCandidata = categoriasSupuestas[prod.categoria]?.volatilidad_pct;
    if (volCatCandidata === undefined || volCatCandidata > volCatActual + 0.0001) continue;

    const agf = prod.administradora ?? prod.emisor;
    if (!buscarAcuerdoVigente(agf, listaAcuerdos, cartola.corte)) continue;

    const prodConAgf: ProductoCatalogo = {
      ...prod,
      administradora: prod.administradora ?? prod.emisor
    };

    for (const serie of prod.series) {
      const evalSerie = evaluarSerie(
        prodConAgf,
        serie,
        montoClp,
        cartola.cliente,
        acuerdos,
        null,
        cartola.corte
      );

      if (evalSerie.estado !== 'eligible' || evalSerie.tac_pct >= tacActual) continue;

      const candidato: CandidatoFondo & { volatilidadPct: number } = {
        producto: prodConAgf,
        serieCodigo: evalSerie.codigo,
        tacPct: evalSerie.tac_pct,
        agf,
        esMismoProducto: false,
        volatilidadPct: volCatCandidata
      };

      if (respetaLimitesConcentracion(candidato, montoClp, acumFondo, acumAgf, maxFondoMontoClp, maxAgfMontoClp)) {
        alternativas.push(candidato);
      }
    }
  }

  alternativas.sort((a, b) => {
    if (Math.abs(a.tacPct - b.tacPct) > 0.0001) return a.tacPct - b.tacPct;
    return a.volatilidadPct - b.volatilidadPct;
  });

  if (alternativas.length === 0) return null;
  const mejor = alternativas[0];
  return {
    producto: mejor.producto,
    serieCodigo: mejor.serieCodigo,
    tacPct: mejor.tacPct,
    agf: mejor.agf,
    esMismoProducto: false
  };
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
    if (esProductoSinAgf(p)) return true;
    const agf = p.administradora ?? p.emisor;
    return !!buscarAcuerdoVigente(agf, listaAcuerdos, cartola.corte);
  });

  const candidatos: CandidatoFondo[] = [];

  for (const prod of productosCandidatos) {
    const prodConAgf: ProductoCatalogo = {
      ...prod,
      administradora: prod.administradora ?? prod.emisor
    };

    // R01: depositos a plazo y efectivo entran directo con TAC 0%
    if (esProductoSinAgf(prodConAgf)) {
      candidatos.push({
        producto: prodConAgf,
        serieCodigo: 'Única',
        tacPct: 0,
        agf: prodConAgf.administradora ?? prodConAgf.emisor,
        esMismoProducto: prod.id === idProductoActual
      });
      continue;
    }

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
  const listaAcuerdos = acuerdos.distribucion ?? acuerdos.acuerdos ?? [];

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
    const agfActualConAcuerdo = !!buscarAcuerdoVigente(agfActual, listaAcuerdos, cartola.corte);
    const productoActualSinAgf = esProductoSinAgf(prodActual);

    // R07: solo se elige un candidato que respete los limites 40% por fondo y 60% por AGF
    let elegido: CandidatoFondo | null = candidatosMasBaratos.find((cand) =>
      respetaLimitesConcentracion(
        cand,
        pos.monto_clp,
        acumFondo,
        acumAgf,
        maxFondoMontoClp,
        maxAgfMontoClp
      )
    ) ?? null;

    // Tercer escalon: si la AGF no tiene acuerdo o la categoria no ofrece una opcion valida,
    // se busca una categoria equivalente o de menor volatilidad con acuerdo vigente.
    if (!elegido && (!agfActualConAcuerdo || candidatosMasBaratos.length > 0)) {
      elegido = buscarAlternativaMenorVolatilidad(
        prodActual,
        pos.monto_clp,
        tacActual,
        volCatActual,
        cartola,
        catalogo,
        acuerdos,
        supuestos,
        acumFondo,
        acumAgf,
        maxFondoMontoClp,
        maxAgfMontoClp
      );
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
      const sinAlternativaEnUniverso = !agfActualConAcuerdo && !productoActualSinAgf;

      sustituciones.push({
        idProductoActual: prodActual.id,
        nombreProductoActual: prodActual.nombre,
        categoria: prodActual.categoria,
        montoClp: pos.monto_clp,
        serieActual: pos.serie,
        tacActualPct: tacActual,
        idProductoSugerido: sinAlternativaEnUniverso ? '' : prodActual.id,
        nombreProductoSugerido: sinAlternativaEnUniverso
          ? 'Sin alternativa dentro de los acuerdos vigentes'
          : prodActual.nombre,
        serieSugerida: sinAlternativaEnUniverso ? '—' : (pos.serie ?? 'N/A'),
        tacSugeridaPct: tacActual,
        ahorroBps: 0,
        ahorroAnualClp: 0,
        agfSugerida: sinAlternativaEnUniverso ? '—' : agfActual,
        esMismoProducto: !sinAlternativaEnUniverso
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
