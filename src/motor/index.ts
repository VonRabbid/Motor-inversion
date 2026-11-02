import type {
  Cartola,
  Catalogo,
  Acuerdos,
  DiagnosticoCartola,
  MetaFinanciera,
  Supuestos,
  ResultadoNivel2
} from '../types/domain';
import { calcularDiagnostico } from './diagnostico';
import { calcularPropuestaSeries } from './propuestaSeries';
import { proyectarEscenariosMeta, construirCarteraMeta } from './metas';
import { calcularPropuestaFondos } from './propuestaFondos';

export * from './evaluadorSeries';
export * from './diagnostico';
export * from './propuestaSeries';
export * from './metas';
export * from './propuestaFondos';

export function ejecutarNivel1(
  cartola: Cartola,
  catalogo: Catalogo,
  acuerdos: Acuerdos
): DiagnosticoCartola {
  const diag = calcularDiagnostico(cartola, catalogo, acuerdos);
  const propuesta = calcularPropuestaSeries(
    diag.posiciones,
    diag.total_identificado_clp,
    diag.costo_actual_anual_clp
  );

  return {
    total_cartera_clp: diag.total_cartera_clp,
    total_identificado_clp: diag.total_identificado_clp,
    total_no_identificado_clp: diag.total_no_identificado_clp,
    pct_no_identificado: diag.pct_no_identificado,
    costo_actual_anual_clp: diag.costo_actual_anual_clp,
    tac_actual_ponderada_pct: diag.tac_actual_ponderada_pct,
    ahorro_elegible_anual_clp: propuesta.ahorroElegibleTotalClp,
    tac_nueva_elegible_ponderada_pct: propuesta.nuevaTacPonderadaPct,
    ahorro_condicional_adicional_clp: propuesta.ahorroCondicionalTotalClp,
    posiciones: propuesta.posicionesOptimizadas,
    alertas: diag.alertas
  };
}

export function ejecutarNivel2(
  meta: MetaFinanciera,
  supuestos: Supuestos,
  cartola: Cartola,
  catalogo: Catalogo,
  acuerdos: Acuerdos
): ResultadoNivel2 {
  const fechaCorte = cartola?.corte || '2026-09-30';
  const cliente = cartola?.cliente;
  const carteraMeta = construirCarteraMeta(
    meta,
    supuestos,
    catalogo,
    acuerdos,
    cliente ?? 'moderado',
    fechaCorte
  );
  const metas = proyectarEscenariosMeta(meta, supuestos, fechaCorte, carteraMeta);
  const fondos = calcularPropuestaFondos(cartola, catalogo, acuerdos, supuestos);

  return {
    metas,
    fondos,
    carteraMeta
  };
}
