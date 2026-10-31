/**
 * Definiciones de Tipos y Modelos de Datos — Motor de Propuestas de Inversión
 * Cumple con SPEC.md para la arquitectura de funciones puras en src/motor/
 */

export * from './types/domain';

// ============================================================================
// Meta Financiera (meta.json)
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
// Supuestos de Mercado y Optimización (supuestos.json)
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
// Modelos adicionales de Nivel 1
// ============================================================================

export interface PosicionNormalizada {
  id: string;
  producto_id: string | null;
  nombre_producto: string;
  descripcion_original?: string;
  emisor_id: string | null;
  emisor_nombre: string | null;
  tipo_producto: string;
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
  ahorro_anual_pp: number;
  ahorro_anual_clp: number;
  es_cambio_recomendado: boolean;
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

export interface OpcionesMotor {
  mostrarComisionDistribuidor: boolean;
}
