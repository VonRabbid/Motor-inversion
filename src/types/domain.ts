/**
 * Tipos de dominio para el Motor de Propuestas de Inversión
 * Cumple con SPEC.md y las reglas de negocio de Nivel 1
 */

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

export interface CurvaCostoPermanencia {
  horizonte_anios: number;
  costo_total_pct_de_aportes: number;
  multa_rescate_pct: number;
}

export interface SerieCatalogo {
  codigo: string;
  tac_pct: number;
  minimo_clp: number;
  requiere_mandato?: boolean;
  solo_apv?: boolean;
  abierta?: boolean;
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

export interface AcuerdoEmisor {
  emisor: string;
  estado: 'active' | 'inactive' | string;
  vigente_desde: string;
  vigente_hasta: string | null;
  mandato: boolean;
  patrimonio_agregado_clp: number;
  patrimonio_al: string;
  series: Record<string, Record<string, number>>;
}

export interface ProductoSinSerieAcuerdo {
  comision_distribucion_pct: number;
}

export interface Acuerdos {
  distribuidor: string;
  acuerdos: AcuerdoEmisor[];
  productos_sin_serie: Record<string, ProductoSinSerieAcuerdo>;
  _aviso?: string;
  _nota?: string;
}

export type AcuerdosDistribucion = Acuerdos;

export interface EvaluacionSerie {
  serie: string;
  tac_pct: number;
  minimo_clp: number;
  estado: EstadoSerie;
  comision_distribucion_pct: number | null;
  motivo?: string;
}

export interface DiagnosticoPosicion {
  posicion: PosicionCartola;
  producto_id: string | null;
  nombre: string;
  tipo: TipoProducto | 'desconocido';
  identificado: boolean;
  monto_clp: number;
  peso_pct: number;
  serie_actual: string | null;
  tac_actual_pct: number;
  costo_actual_clp: number;
  series_evaluadas: EvaluacionSerie[];
  serie_elegible_optima: EvaluacionSerie | null;
  ahorro_elegible_clp: number;
  serie_condicional_optima: EvaluacionSerie | null;
  ahorro_condicional_adicional_clp: number;
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
