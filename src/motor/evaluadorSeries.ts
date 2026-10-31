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
  serieActualCodigo: string | null
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

  // Regla 0: verificar acuerdo de distribucion activo y serie habilitada
  const acuerdo = acuerdos.acuerdos.find(
    (a) => a.emisor === producto.emisor && a.estado === 'active'
  );
  const comision = acuerdo?.series?.[producto.id]?.[serie.codigo];
  if (!acuerdo || comision === undefined) {
    return {
      codigo: serie.codigo,
      serie: serie.codigo,
      tac_pct: serie.tac_pct,
      estado: 'out_of_scope',
      regla: 0,
      motivo: `AGF ${producto.emisor} no tiene acuerdo vigente`
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
