import type {
  Cartola,
  Catalogo,
  Acuerdos,
  DiagnosticoPosicion,
  EvaluacionSerie
} from '../types/domain';
import { evaluarSerie } from './evaluadorSeries';

export interface ResultadoDiagnosticoBase {
  total_cartera_clp: number;
  total_identificado_clp: number;
  total_no_identificado_clp: number;
  pct_no_identificado: number;
  costo_actual_anual_clp: number;
  tac_actual_ponderada_pct: number;
  posiciones: DiagnosticoPosicion[];
  alertas: string[];
}

// Diagnostica la cartera actual calculando costos, pesos y evaluando series segun R02 y R04
export function calcularDiagnostico(
  cartola: Cartola,
  catalogo: Catalogo,
  acuerdos: Acuerdos
): ResultadoDiagnosticoBase {
  const alertas: string[] = [];
  let totalCartera = 0;
  let totalIdentificado = 0;
  let totalNoIdentificado = 0;

  // Clasificar posiciones identificadas en catalogo frente a posiciones no identificadas
  for (const pos of cartola.posiciones) {
    totalCartera += pos.monto_clp;

    // Validacion de consistencia entre cuotas, valor cuota y monto CLP declarado
    if (pos.cuotas !== null && pos.valor_cuota !== null) {
      const calculoMonto = pos.cuotas * pos.valor_cuota;
      if (Math.abs(calculoMonto - pos.monto_clp) > 1) {
        alertas.push(
          `Discrepancia en ${pos.producto ?? 'posicion'}: cuotas (${pos.cuotas}) * valor cuota (${pos.valor_cuota}) = ${calculoMonto} CLP, declarado ${pos.monto_clp} CLP`
        );
      }
    }

    if (pos.producto === null) {
      totalNoIdentificado += pos.monto_clp;
    } else {
      totalIdentificado += pos.monto_clp;
    }
  }

  // Porcentaje no identificado sobre el patrimonio total declarado
  const pctNoIdentificado = totalCartera > 0
    ? Number(((totalNoIdentificado / totalCartera) * 100).toFixed(2))
    : 0;

  let costoActualAnual = 0;
  const posicionesDiagnostico: DiagnosticoPosicion[] = [];

  // R02: procesar unicamente activos identificados para ponderacion de costos
  for (const pos of cartola.posiciones) {
    if (pos.producto === null) {
      continue;
    }

    const productoCat = catalogo.productos.find((p) => p.id === pos.producto);
    if (!productoCat) {
      alertas.push(`Producto no encontrado en catalogo: ${pos.producto}`);
      continue;
    }

    let tacActualPct = 0;

    // R02: depositos a plazo y efectivo entran con costo 0 en la cartola
    if (productoCat.tipo === 'time_deposit' || productoCat.tipo === 'cash') {
      tacActualPct = 0;
    } else {
      const serieCat = productoCat.series.find((s) => s.codigo === pos.serie);
      tacActualPct = serieCat ? serieCat.tac_pct : 0;
    }

    // Costo anual en pesos de la posicion actual
    const costoPosicionClp = Math.round(pos.monto_clp * (tacActualPct / 100));
    costoActualAnual += costoPosicionClp;

    // Peso porcentual relativo al total identificado
    const pesoPct = totalIdentificado > 0
      ? Number(((pos.monto_clp / totalIdentificado) * 100).toFixed(2))
      : 0;

    // R04: evaluacion de cada una de las series disponibles en el producto
    const seriesEvaluadas: EvaluacionSerie[] = productoCat.series.map((serie) =>
      evaluarSerie(
        productoCat,
        serie,
        pos.monto_clp,
        cartola.cliente,
        acuerdos,
        pos.serie
      )
    );

    posicionesDiagnostico.push({
      idProducto: productoCat.id,
      nombreProducto: productoCat.nombre,
      serieActual: pos.serie,
      monto: pos.monto_clp,
      pesoPct,
      tacPct: tacActualPct,
      costoAnualClp: costoPosicionClp,
      seriesEvaluadas,
      producto_id: productoCat.id,
      nombre: productoCat.nombre,
      monto_clp: pos.monto_clp,
      peso_pct: pesoPct,
      tac_actual_pct: tacActualPct,
      costo_actual_clp: costoPosicionClp,
      series_evaluadas: seriesEvaluadas
    });
  }

  // R02: TAC ponderada sobre el total identificado redondeada a 4 decimales
  const tacPonderadaPct = totalIdentificado > 0
    ? Number(((costoActualAnual / totalIdentificado) * 100).toFixed(4))
    : 0;

  return {
    total_cartera_clp: totalCartera,
    total_identificado_clp: totalIdentificado,
    total_no_identificado_clp: totalNoIdentificado,
    pct_no_identificado: pctNoIdentificado,
    costo_actual_anual_clp: costoActualAnual,
    tac_actual_ponderada_pct: tacPonderadaPct,
    posiciones: posicionesDiagnostico,
    alertas
  };
}
