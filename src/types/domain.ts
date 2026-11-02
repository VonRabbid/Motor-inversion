// Contratos de datos para productos, catalogo y acuerdos comerciales
export type TipoProducto =
  | 'mutual_fund'
  | 'investment_fund'
  | 'time_deposit'
  | 'cash'
  | 'equity_etf'
  | 'insurance_savings'
  | 'other';

export type TipoEmisor = 'agf' | 'aseguradora' | 'banco' | string;
export type PerfilRiesgo = 'conservador' | 'moderado' | 'agresivo' | string;

export type EstadoSerie =
  | 'actual'
  | 'eligible'
  | 'conditional'
  | 'blocked'
  | 'out_of_scope';

// Estructura de la cartola del cliente
export interface Cliente {
  referencia: string;
  perfil_riesgo: PerfilRiesgo;
  perfil_evaluado_el: string;
  plan_apv: boolean;
}

export interface PosicionCartola {
  producto: string | null;
  descripcion_original?: string;
  serie: string | null;
  cuotas: number | null;
  valor_cuota: number | null;
  monto_clp: number;
}

export interface Cartola {
  cliente: Cliente;
  corte: string;
  moneda: string;
  posiciones: PosicionCartola[];
  _aviso?: string;
}

// Catalogo maestro de fondos y condiciones por serie
export interface SerieCatalogo {
  codigo: string;
  tac_pct: number;
  minimo_clp?: number;
  abierta?: boolean;
  solo_apv?: boolean;
  requiere_mandato?: boolean;
}

export interface ProductoCatalogo {
  id: string;
  emisor: string;
  administradora?: string;
  nombre: string;
  tipo: TipoProducto;
  categoria: string;
  liquidez_dias: number;
  series: SerieCatalogo[];
}

export interface Catalogo {
  version: string;
  corte_costos: string;
  fuente_costos?: string;
  productos: ProductoCatalogo[];
}

// Acuerdos de distribucion vigentes y comisiones
export interface AcuerdoAGF {
  emisor: string;
  agf?: string;
  estado: 'active' | 'inactive';
  vigente_desde: string;
  vigente_hasta: string | null;
  mandato: boolean;
  patrimonio_agregado_clp: number;
  series: Record<string, Record<string, number>>;
}

export interface Acuerdos {
  distribuidor: string;
  acuerdos: AcuerdoAGF[];
  distribucion?: AcuerdoAGF[];
}

// Estructuras de salida para diagnostico y propuesta
export interface EvaluacionSerie {
  codigo: string;
  tac_pct: number;
  estado: EstadoSerie;
  regla: number;
  motivo: string;
  serie?: string;
}

export interface DiagnosticoPosicion {
  idProducto: string;
  nombreProducto: string;
  serieActual: string | null;
  monto: number;
  pesoPct: number;
  tacPct: number;
  costoAnualClp: number;
  seriesEvaluadas: EvaluacionSerie[];
  mejorElegible?: {
    serie: string;
    tacPct: number;
    ahorroBps: number;
    ahorroClp: number;
  };
  condicionalAdicional?: {
    serie: string;
    tacPct: number;
    ahorroClpAdicional: number;
    condicion: string;
  };
  producto_id?: string;
  nombre?: string;
  monto_clp?: number;
  peso_pct?: number;
  tac_actual_pct?: number;
  costo_actual_clp?: number;
  series_evaluadas?: EvaluacionSerie[];
}

export interface DiagnosticoCartola {
  total_cartera_clp: number;
  total_identificado_clp: number;
  total_no_identificado_clp: number;
  pct_no_identificado: number;
  costo_actual_anual_clp: number;
  tac_actual_ponderada_pct: number;
  ahorro_elegible_anual_clp: number;
  tac_nueva_elegible_ponderada_pct: number;
  ahorro_condicional_adicional_clp: number;
  posiciones: DiagnosticoPosicion[];
  alertas: string[];
}

// --- Dominio Nivel 2: Metas Financieras y Supuestos de Inversion (R06) ---

export interface DesembolsoMeta {
  fecha: string;
  monto_uf?: number;
  uf?: number;
}

export interface MetaFinanciera {
  nombre: string;
  capital_asignado_clp: number;
  moneda?: string;
  desembolsos: DesembolsoMeta[];
}

export interface TramoSupuesto {
  id: string;
  nombre?: string;
  desde_meses: number;
  hasta_meses: number | null;
  categorias_permitidas?: string[];
  categorias?: string[];
}

export interface CategoriaSupuesto {
  retorno_real_pct?: number;
  retorno_real_bruto_pct?: number;
  volatilidad_pct: number;
  peso_crecimiento?: number;
}

export interface EscenarioSupuesto {
  id?: string;
  nombre?: string;
  ajuste_retorno_pp: number;
  probabilidad_pct?: number;
}

export interface LimitesSupuestos {
  max_por_fondo_pct: number;
  max_por_agf_pct: number;
}

export interface Supuestos {
  valor_uf_clp?: number;
  uf?: { valor_clp: number; fecha?: string };
  tramos: TramoSupuesto[];
  categorias: Record<string, CategoriaSupuesto>;
  escenarios?: Record<string, EscenarioSupuesto> | EscenarioSupuesto[];
  perfiles?: Record<string, { max_crecimiento_pct: number }>;
  limites?: LimitesSupuestos;
}

export interface DesembolsoCalculado {
  fecha: string;
  montoUf: number;
  montoClp: number;
  mesesDesdeCorte: number;
  aniosDesdeCorte: number;
  tramoId: string;
  tramoNombre: string;
  retornoRealAplicadoPct: number;
  valorPresenteUf: number;
  valorPresenteClp: number;
}

export interface ResumenTramoMeta {
  tramoId: string;
  nombre: string;
  cantidadDesembolsos: number;
  totalDesembolsosUf: number;
  totalVpUf: number;
  totalVpClp: number;
  categoriasPermitidas: string[];
}

export interface ResultadoCalculoMetas {
  nombreMeta: string;
  fechaCorte: string;
  valorUfClp: number;
  capitalAsignadoClp: number;
  capitalAsignadoUf: number;
  totalDesembolsosUf: number;
  totalDesembolsosClp: number;
  totalVpUf: number;
  totalVpClp: number;
  diferenciaUf: number;
  diferenciaClp: number;
  alcanza: boolean;
  estadoBalance: 'superavit' | 'deficit' | 'justo';
  desembolsos: DesembolsoCalculado[];
  resumenTramos: ResumenTramoMeta[];
}

export interface DetalleEscenarioMeta {
  clave: string;
  nombre: string;
  ajustePp: number;
  totalVpUf: number;
  totalVpClp: number;
  diferenciaUf: number;
  diferenciaClp: number;
  alcanza: boolean;
  estadoBalance: 'superavit' | 'deficit' | 'justo';
  saldoFinalUf: number;
  fechaAgotamiento: string | null;
  porcentajeCoberturaPct: number;
  retornoRealNetoSupuestoPct: number;
  costoAcumuladoUf: number;
  costoAcumuladoClp: number;
}

export interface ProyeccionMetasEscenarios {
  resultadoBase: ResultadoCalculoMetas;
  escenarios: Record<string, DetalleEscenarioMeta>;
}

// --- Dominio Nivel 2: Fondos Equivalentes y Limites de Diversificacion (R07) ---

export interface SustitucionFondo {
  idProductoActual: string;
  nombreProductoActual: string;
  categoria: string;
  montoClp: number;
  serieActual: string | null;
  tacActualPct: number;
  idProductoSugerido: string;
  nombreProductoSugerido: string;
  serieSugerida: string;
  tacSugeridaPct: number;
  ahorroBps: number;
  ahorroAnualClp: number;
  agfSugerida: string;
  esMismoProducto: boolean;
}

export interface MetricaConcentracion {
  nombre: string;
  montoClp: number;
  participacionPct: number;
  excedeLimite: boolean;
  limiteMaxPct: number;
}

export interface ResultadoPropuestaFondos {
  sustituciones: SustitucionFondo[];
  totalIdentificadoClp: number;
  costoActualAnualClp: number;
  costoPropuestoAnualClp: number;
  ahorroTotalAnualClp: number;
  tacActualPonderadaPct: number;
  tacPropuestaPonderadaPct: number;
  volatilidadActualPonderadaPct: number;
  volatilidadPropuestaPonderadaPct: number;
  retornoBrutoPonderadoActualPct: number;
  retornoBrutoPonderadoPropuestoPct: number;
  retornoRealNetoActualPct: number;
  retornoRealNetoPropuestoPct: number;
  concentracionPorFondo: Record<string, MetricaConcentracion>;
  concentracionPorAgf: Record<string, MetricaConcentracion>;
  alertasConcentracion: string[];
}

// Cartera construida para financiar la meta financiera (R06 Pasos 3 a 6)
export interface FondoAsignadoMeta {
  tramoId: string;
  tramoNombre: string;
  idProducto: string;
  nombreProducto: string;
  agf: string;
  serie: string;
  tacPct: number;
  categoria: string;
  liquidezDias: number;
  capitalAsignadoUf: number;
  capitalAsignadoClp: number;
  pesoCarteraPct: number;
  pesoCrecimiento: number;
  volatilidadPct: number;
}

export interface CarteraSugeridaMeta {
  asignaciones: FondoAsignadoMeta[];
  pesoCrecimientoCarteraPct: number;
  maxCrecimientoPermitidoPct: number;
  aplicaReduccion24Meses: boolean;
  cumplePerfilCrecimiento: boolean;
  tacPonderadaMetaPct: number;
  volatilidadPonderadaMetaPct: number;
  alertas: string[];
}

// Contrato de datos unificado para Nivel 2 (Metas + Fondos Equivalentes)
export interface ResultadoNivel2 {
  metas: ProyeccionMetasEscenarios;
  fondos: ResultadoPropuestaFondos;
  carteraMeta?: CarteraSugeridaMeta;
}
