import type {
  ProductoCatalogo,
  SerieCatalogo,
  Cliente,
  Acuerdos,
  EvaluacionSerie
} from '../types/domain';

// Evaluador de elegibilidad de series segun precedencia estricta de la regla R04
export function evaluarSerie(
  producto: ProductoCatalogo,
  serie: SerieCatalogo,
  ticketMonto: number,
  cliente: Cliente,
  acuerdos: Acuerdos,
  serieActualCodigo: string | null,
  fechaCorte = '2026-09-30'
): EvaluacionSerie {
  // Posicion que el cliente mantiene actualmente en su cartola
  if (serie.codigo === serieActualCodigo) {
    return {
      codigo: serie.codigo,
      serie: serie.codigo,
      tac_pct: serie.tac_pct,
      estado: 'actual',
      regla: -1,
      motivo: 'Serie que tiene hoy el cliente'
    };
  }

  const listaAcuerdos = acuerdos.acuerdos ?? acuerdos.distribucion ?? [];

  // R01: verificar que exista acuerdo activo y vigente a la fecha de corte
  const acuerdo = listaAcuerdos.find((a) => {
    const agf = a.emisor ?? a.agf;
    const agfProd = producto.administradora ?? producto.emisor;
    if (agf !== agfProd) return false;
    if (a.estado !== 'active') return false;
    if (a.vigente_desde && a.vigente_desde > fechaCorte) return false;
    if (a.vigente_hasta && a.vigente_hasta < fechaCorte) return false;
    return true;
  });

  // Regla 0: AGF sin acuerdo vigente o serie no habilitada en convenio
  if (!acuerdo) {
    return {
      codigo: serie.codigo,
      serie: serie.codigo,
      tac_pct: serie.tac_pct,
      estado: 'out_of_scope',
      regla: 0,
      motivo: `AGF ${producto.emisor} no tiene acuerdo de distribución vigente`
    };
  }

  const comision = acuerdo.series?.[producto.id]?.[serie.codigo];
  if (comision === undefined) {
    return {
      codigo: serie.codigo,
      serie: serie.codigo,
      tac_pct: serie.tac_pct,
      estado: 'out_of_scope',
      regla: 0,
      motivo: `Acuerdo con AGF ${producto.emisor} no habilita la serie ${serie.codigo}`
    };
  }

  // Regla 1: series cerradas a nuevas contrataciones
  const abierta = serie.abierta ?? true;
  if (!abierta) {
    return {
      codigo: serie.codigo,
      serie: serie.codigo,
      tac_pct: serie.tac_pct,
      estado: 'blocked',
      regla: 1,
      motivo: 'Serie cerrada'
    };
  }

  // Regla 2: series reservadas para ahorro previsional voluntario
  const soloApv = serie.solo_apv ?? false;
  if (soloApv && !cliente.plan_apv) {
    return {
      codigo: serie.codigo,
      serie: serie.codigo,
      tac_pct: serie.tac_pct,
      estado: 'blocked',
      regla: 2,
      motivo: 'Solo APV y el plan del cliente no es APV'
    };
  }

  // Regla 3: series que exigen mandato de administracion
  const requiereMandato = serie.requiere_mandato ?? false;
  if (requiereMandato && !acuerdo.mandato) {
    return {
      codigo: serie.codigo,
      serie: serie.codigo,
      tac_pct: serie.tac_pct,
      estado: 'conditional',
      regla: 3,
      motivo: `Requiere mandato y AGF ${producto.emisor} no lo tiene`
    };
  }

  // Reglas 4 y 5: validacion de ticket minimo individual vs patrimonio agregado
  const minimoClp = serie.minimo_clp ?? 0;
  if (minimoClp > ticketMonto) {
    if (acuerdo.patrimonio_agregado_clp >= minimoClp) {
      return {
        codigo: serie.codigo,
        serie: serie.codigo,
        tac_pct: serie.tac_pct,
        estado: 'conditional',
        regla: 4,
        motivo: `Minimo ${minimoClp} mayor que el ticket; el patrimonio agregado en AGF ${producto.emisor} (${acuerdo.patrimonio_agregado_clp}) lo alcanza`
      };
    }
    return {
      codigo: serie.codigo,
      serie: serie.codigo,
      tac_pct: serie.tac_pct,
      estado: 'blocked',
      regla: 5,
      motivo: `Minimo ${minimoClp} supera el ticket`
    };
  }

  // Regla 6: cumple todas las condiciones comerciales y normativas
  return {
    codigo: serie.codigo,
    serie: serie.codigo,
    tac_pct: serie.tac_pct,
    estado: 'eligible',
    regla: 6,
    motivo: 'Cumple condiciones'
  };
}
