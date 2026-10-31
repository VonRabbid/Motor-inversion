import type { DiagnosticoPosicion, EvaluacionSerie } from '../types/domain';

export interface ResumenPropuestaSeries {
  posicionesOptimizadas: DiagnosticoPosicion[];
  ahorroElegibleTotalClp: number;
  ahorroCondicionalTotalClp: number;
  nuevaTacPonderadaPct: number;
}

// R05: optimiza series por posicion identificando la alternativa elegible de menor costo
export function calcularPropuestaSeries(
  posiciones: DiagnosticoPosicion[],
  totalIdentificadoClp: number,
  costoActualAnualClp: number
): ResumenPropuestaSeries {
  let ahorroElegibleTotal = 0;
  let ahorroCondicionalTotal = 0;

  const posicionesOptimizadas = posiciones.map((pos) => {
    // Filtrar unicamente series habilitadas sin condiciones pendientes
    const seriesElegibles = pos.seriesEvaluadas.filter((s) => s.estado === 'eligible');

    let mejorElegible: EvaluacionSerie | undefined;
    if (seriesElegibles.length > 0) {
      mejorElegible = seriesElegibles.reduce((min, s) =>
        s.tac_pct < min.tac_pct ? s : min
      );
    }

    let detalleMejorElegible: DiagnosticoPosicion['mejorElegible'] = undefined;

    // R05: calcular reduccion de costo si la serie elegible supera a la serie actual
    if (mejorElegible && mejorElegible.tac_pct < pos.tacPct) {
      const ahorroBps = Math.round((pos.tacPct - mejorElegible.tac_pct) * 100);
      const ahorroClp = Math.round(pos.monto * ((pos.tacPct - mejorElegible.tac_pct) / 100));

      ahorroElegibleTotal += ahorroClp;

      detalleMejorElegible = {
        serie: mejorElegible.codigo,
        tacPct: mejorElegible.tac_pct,
        ahorroBps,
        ahorroClp
      };
    }

    // Identificar series condicionales con potencial de ahorro superior a la serie elegible
    const tacReferencia = mejorElegible ? mejorElegible.tac_pct : pos.tacPct;
    const seriesCondicionales = pos.seriesEvaluadas.filter(
      (s) => s.estado === 'conditional' && s.tac_pct < tacReferencia
    );

    let detalleCondicional: DiagnosticoPosicion['condicionalAdicional'] = undefined;

    if (seriesCondicionales.length > 0) {
      const mejorCondicional = seriesCondicionales.reduce((min, s) =>
        s.tac_pct < min.tac_pct ? s : min
      );
      const ahorroAdicionalClp = Math.round(
        pos.monto * ((tacReferencia - mejorCondicional.tac_pct) / 100)
      );

      ahorroCondicionalTotal += ahorroAdicionalClp;

      detalleCondicional = {
        serie: mejorCondicional.codigo,
        tacPct: mejorCondicional.tac_pct,
        ahorroClpAdicional: ahorroAdicionalClp,
        condicion: mejorCondicional.motivo
      };
    }

    return {
      ...pos,
      mejorElegible: detalleMejorElegible,
      condicionalAdicional: detalleCondicional
    };
  });

  // R05: nueva TAC ponderada de la cartera considerando unicamente el ahorro directo elegible
  const nuevoCostoAnual = costoActualAnualClp - ahorroElegibleTotal;
  const nuevaTacPonderadaPct = totalIdentificadoClp > 0
    ? Number(((nuevoCostoAnual / totalIdentificadoClp) * 100).toFixed(4))
    : 0;

  return {
    posicionesOptimizadas,
    ahorroElegibleTotalClp: ahorroElegibleTotal,
    ahorroCondicionalTotalClp: ahorroCondicionalTotal,
    nuevaTacPonderadaPct
  };
}
