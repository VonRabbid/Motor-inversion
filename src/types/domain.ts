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
