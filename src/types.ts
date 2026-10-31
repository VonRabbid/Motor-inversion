/**
 * Definiciones de Tipos y Modelos de Datos — Motor de Propuestas de Inversión
 * Cumple con SPEC.md para la arquitectura de funciones puras en src/motor/
 */

// ============================================================================
// 1. Catálogo de Productos y Emisores (catalogo.json)
// ============================================================================

export type TipoProducto =
  | 'mutual_fund'
  | 'investment_fund'
  | 'time_deposit'
  | 'cash'
  | 'equity_etf'
  | 'insurance_savings'
  | 'other';

export type TipoEmisor = 'agf' | 'aseguradora' | 'banco' | string;

export interface CurvaCostoPermanencia {
  horizonte_anios: number;
  costo_total_pct_de_aportes: number;
  multa_rescate_pct: number;
}

export interface SerieCatalogo {
  codigo: string;
  tac_pct: number;
  minimo_clp: number;
  requiere_mandato?: boolean; // Por defecto: false
  solo_apv?: boolean;         // Por defecto: false
  abierta?: boolean;          // Por defecto: true
}

export interface ProductoCatalogo {
  id: string;
  emisor: string;
  nombre: string;
  tipo: TipoProducto;
  categoria: string;
  liquidez_dias: number;
  series: SerieCatalogo[];
  prima_riesgo_pct_del_aporte?: number;
  curva_costo_permanencia?: CurvaCostoPermanencia[];
}

export interface Emisor {
  id: string;
  nombre: string;
  tipo: TipoEmisor;
}

export interface Catalogo {
  version: string;
  corte_costos: string;
  fuente_costos: string;
  emisores: Emisor[];
  productos: ProductoCatalogo[];
  _aviso?: string;
  _nota?: string;
}

// ============================================================================
// 2. Acuerdos de Distribución (acuerdos.json)
// ============================================================================

export interface AcuerdoEmisor {
  emisor: string;
  estado: 'active' | 'inactive' | string;
  vigente_desde: string;
  vigente_hasta: string | null;
  mandato: boolean;
  patrimonio_agregado_clp: number;
  patrimonio_al: string;
  /**
   * Mapeo: productoId -> codigoSerie -> comision_distribucion_pct anual
   * Ejemplo: { "alfa-deuda-uf": { "CLASI": 0.80, "B": 0.55, ... } }
   */
  series: Record<string, Record<string, number>>;
}

export interface ProductoSinSerieAcuerdo {
  comision_distribucion_pct: number;
}

export interface AcuerdosDistribucion {
  distribuidor: string;
  acuerdos: AcuerdoEmisor[];
  productos_sin_serie: Record<string, ProductoSinSerieAcuerdo>;
  _aviso?: string;
  _nota?: string;
}

// ============================================================================
// 3. Cartola del Cliente (cartola.json)
// ============================================================================

export type PerfilRiesgo = 'conservador' | 'moderado' | 'agresivo' | string;

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

// ============================================================================
// 4. Meta Financiera (meta.json)
// ============================================================================

export interface Desembolso {
  fecha: string;
  uf: number;
}

export interface MetaFinanciera {
  tipo: string;
  nombre: string;
  referencia_cliente: string;
  capital_asignado_clp: number;
  valor_uf_clp: number;
  fecha_referencia: string;
  desembolsos: Desembolso[];
  _aviso?: string;
}

// ============================================================================
// 5. Supuestos de Mercado y Optimización (supuestos.json)
// ============================================================================

export interface SupuestoUF {
  valor_clp: number;
  fecha: string;
}

export interface SupuestoCategoria {
  retorno_real_bruto_pct: number;
  volatilidad_pct: number;
  peso_crecimiento: number; // 0, 0.5 o 1
}

export interface SupuestoPerfil {
  max_crecimiento_pct: number;
}

export interface LimitesSupuestos {
  max_por_fondo_pct: number;
  max_por_agf_pct: number;
}

export interface TramoMeta {
  id: string;
  desde_meses: number;
  hasta_meses: number | null;
  categorias: string[];
}

export interface EscenarioSupuesto {
  id: 'adverso' | 'base' | 'favorable' | string;
  ajuste_retorno_pp: number;
}

export interface Supuestos {
  uf: SupuestoUF;
  categorias: Record<string, SupuestoCategoria>;
  perfiles: Record<string, SupuestoPerfil>;
  limites: LimitesSupuestos;
  tramos: TramoMeta[];
  escenarios: EscenarioSupuesto[];
  _aviso?: string;
}

// ============================================================================
// 6. Modelos de Salida Nivel 1 (Diagnóstico y Optimización de Series)
// ============================================================================

/**
 * Representa una posición de la cartola una vez normalizada y contrastada
 * con el catálogo y los acuerdos de distribución.
 */
export interface PosicionNormalizada {
  id: string;
  producto_id: string | null;
  nombre_producto: string;
  descripcion_original?: string;
  emisor_id: string | null;
  emisor_nombre: string | null;
  tipo_producto: TipoProducto | 'desconocido';
  categoria: string | null;
  liquidez_dias: number | null;
  serie_actual: string | null;
  cuotas: number | null;
  valor_cuota: number | null;
  monto_clp: number;
  peso_cartera_pct: number;
  tac_actual_pct: number | null;
  costo_anual_clp: number;
  comision_distribucion_actual_pct: number | null;
  es_reconocido: boolean;
  tiene_acuerdo_distribucion: boolean;
  advertencias: string[];
}

/**
 * Evaluación de elegibilidad de una serie alternativa para un fondo determinado.
 */
export interface EvaluacionSerie {
  serie: string;
  tac_pct: number;
  minimo_clp: number;
  abierta: boolean;
  solo_apv: boolean;
  requiere_mandato: boolean;
  comision_distribucion_pct: number | null;
  cumple_minimo: boolean;
  cumple_apv: boolean;
  cumple_mandato: boolean;
  cumple_abierta: boolean;
  cumple_acuerdo: boolean;
  es_elegible: boolean;
  motivos_no_elegible: string[];
}

/**
 * Análisis de optimización de serie para una posición específica,
 * comparando la serie actual con la serie óptima elegible de menor costo.
 */
export interface AhorroPosicion {
  posicion_id: string;
  producto_id: string;
  nombre_producto: string;
  monto_clp: number;
  serie_actual: string;
  tac_actual_pct: number;
  costo_actual_anual_clp: number;
  comision_distribucion_actual_pct: number | null;
  serie_propuesta: string;
  tac_propuesta_pct: number;
  costo_propuesto_anual_clp: number;
  comision_distribucion_propuesta_pct: number | null;
  ahorro_anual_pp: number; // Reducción en puntos porcentuales de TAC
  ahorro_anual_clp: number; // Ahorro monetario anual
  es_cambio_recomendado: boolean;
  series_evaluadas: EvaluacionSerie[];
}

export type TipoAlertaDiagnostico =
  | 'PERFIL_VENCIDO'
  | 'DISCREPANCIA_MONTO'
  | 'PRODUCTO_NO_RECONOCIDO'
  | 'SIN_ACUERDO_DISTRIBUCION'
  | 'OTRO';

export interface AlertaDiagnostico {
  tipo: TipoAlertaDiagnostico;
  severidad: 'info' | 'warning' | 'error';
  mensaje: string;
  posicion_id?: string;
  detalle?: Record<string, unknown>;
}

/**
 * Estructura completa de salida para el Nivel 1 (Diagnóstico de Cartera Actual
 * y Ahorro Inmediato por Optimización de Series).
 */
export interface ResultadoDiagnostico {
  cliente: Cliente;
  corte: string;
  patrimonio_total_clp: number;
  posiciones: PosicionNormalizada[];
  optimizacion_series: AhorroPosicion[];
  costo_actual_total_clp: number;
  costo_actual_ponderado_pct: number;
  costo_optimizado_total_clp: number;
  costo_optimizado_ponderado_pct: number;
  ahorro_total_clp: number;
  ahorro_total_pp: number;
  perfil_vigente: boolean;
  dias_desde_evaluacion_perfil: number;
  alertas: AlertaDiagnostico[];
}

/**
 * Opciones de configuración para el motor de cálculo.
 */
export interface OpcionesMotor {
  mostrarComisionDistribuidor: boolean;
}
