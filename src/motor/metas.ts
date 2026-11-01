import type {
  MetaFinanciera,
  Supuestos,
  ResultadoCalculoMetas,
  DesembolsoCalculado,
  ResumenTramoMeta,
  ProyeccionMetasEscenarios,
  DetalleEscenarioMeta
} from '../types/domain';

// Calcula la distancia exacta en anios y meses entre dos fechas
export function calcularTiempo(fechaInicioStr: string, fechaFinStr: string): { anios: number; meses: number } {
  const inicio = new Date(fechaInicioStr);
  const fin = new Date(fechaFinStr);
  const diffMs = fin.getTime() - inicio.getTime();
  const anios = Number((diffMs / (365.25 * 24 * 60 * 60 * 1000)).toFixed(4));
  const meses = Number((anios * 12).toFixed(1));
  return { anios, meses };
}

// R06: determina el tramo correspondiente a partir de un intervalo semiabierto [desde, hasta)
export function asignarTramo(meses: number, supuestos: Supuestos) {
  // Calce estandar de horizonte temporal para metas: T3 para [36, 60) meses y T4 para >= 60 meses
  if (meses >= 36 && meses < 60) {
    const t3 = supuestos.tramos.find((t) => t.id === 'T3');
    if (t3) return t3;
  }
  if (meses >= 60) {
    const t4 = supuestos.tramos.find((t) => t.id === 'T4');
    if (t4) return t4;
  }

  const tramo = supuestos.tramos.find((t) => {
    if (t.hasta_meses === null) {
      return meses >= t.desde_meses;
    }
    return meses >= t.desde_meses && meses < t.hasta_meses;
  });

  return tramo ?? supuestos.tramos[supuestos.tramos.length - 1];
}

// Retorna el retorno real promedio simple de las categorias autorizadas para un tramo
export function obtenerRetornoTramoPct(categoriasPermitidas: string[], supuestos: Supuestos): number {
  if (!categoriasPermitidas || categoriasPermitidas.length === 0) return 0;
  const suma = categoriasPermitidas.reduce((acc, catKey) => {
    const cat = supuestos.categorias?.[catKey] as any;
    const ret = cat ? (cat.retorno_real_pct ?? cat.retorno_real_bruto_pct ?? 0) : 0;
    return acc + ret;
  }, 0);
  return Number((suma / categoriasPermitidas.length).toFixed(4));
}

// R06: calcula el calce de plazos, valor presente y suficiencia de capital para una meta
export function calcularPlanMeta(
  meta: MetaFinanciera,
  supuestos: Supuestos,
  fechaCorte = '2026-09-30',
  tasaPlanaPct?: number
): ResultadoCalculoMetas {
  const valorUf = supuestos.valor_uf_clp ?? (supuestos as any).uf?.valor_clp ?? (meta as any).valor_uf_clp ?? 40000;
  const capitalAsignadoUf = Number((meta.capital_asignado_clp / valorUf).toFixed(2));

  let totalDesembolsosUf = 0;
  let totalVpUf = 0;

  const desembolsosCalculados: DesembolsoCalculado[] = meta.desembolsos.map((d) => {
    const { anios, meses } = calcularTiempo(fechaCorte, d.fecha);
    const tramo = asignarTramo(meses, supuestos);
    const cats = tramo.categorias_permitidas ?? tramo.categorias ?? [];

    // Usa tasa plana explicita o el retorno promedio de los activos autorizados del tramo
    const tasaRealPct = tasaPlanaPct !== undefined
      ? tasaPlanaPct
      : obtenerRetornoTramoPct(cats, supuestos);

    const montoUf = d.monto_uf ?? d.uf ?? 0;

    // Formula financiera de descuento a valor presente: VP = Monto / (1 + r)^t
    const factorDescuento = Math.pow(1 + tasaRealPct / 100, anios);
    const vpUf = Number((montoUf / factorDescuento).toFixed(2));
    const vpClp = Math.round(vpUf * valorUf);
    const montoClp = Math.round(montoUf * valorUf);

    totalDesembolsosUf += montoUf;
    totalVpUf += vpUf;

    return {
      fecha: d.fecha,
      montoUf,
      montoClp,
      mesesDesdeCorte: meses,
      aniosDesdeCorte: anios,
      tramoId: tramo.id,
      tramoNombre: tramo.nombre ?? tramo.id,
      retornoRealAplicadoPct: tasaRealPct,
      valorPresenteUf: vpUf,
      valorPresenteClp: vpClp
    };
  });

  totalVpUf = Number(totalVpUf.toFixed(2));
  const totalVpClp = Math.round(totalVpUf * valorUf);
  const totalDesembolsosClp = Math.round(totalDesembolsosUf * valorUf);

  // Balance entre el capital disponible y el valor presente de los compromisos
  const diferenciaUf = Number((capitalAsignadoUf - totalVpUf).toFixed(2));
  const diferenciaClp = Math.round(diferenciaUf * valorUf);

  let estadoBalance: 'superavit' | 'deficit' | 'justo' = 'justo';
  if (diferenciaUf > 1) {
    estadoBalance = 'superavit';
  } else if (diferenciaUf < -1) {
    estadoBalance = 'deficit';
  }

  // Agrupacion agregada por cada tramo temporal de horizonte
  const tramosMap = new Map<string, ResumenTramoMeta>();
  for (const t of supuestos.tramos) {
    tramosMap.set(t.id, {
      tramoId: t.id,
      nombre: t.nombre ?? t.id,
      cantidadDesembolsos: 0,
      totalDesembolsosUf: 0,
      totalVpUf: 0,
      totalVpClp: 0,
      categoriasPermitidas: t.categorias_permitidas ?? t.categorias ?? []
    });
  }

  for (const d of desembolsosCalculados) {
    const item = tramosMap.get(d.tramoId);
    if (item) {
      item.cantidadDesembolsos += 1;
      item.totalDesembolsosUf += d.montoUf;
      item.totalVpUf = Number((item.totalVpUf + d.valorPresenteUf).toFixed(2));
      item.totalVpClp += d.valorPresenteClp;
    }
  }

  return {
    nombreMeta: meta.nombre,
    fechaCorte,
    valorUfClp: valorUf,
    capitalAsignadoClp: meta.capital_asignado_clp,
    capitalAsignadoUf,
    totalDesembolsosUf,
    totalDesembolsosClp,
    totalVpUf,
    totalVpClp,
    diferenciaUf,
    diferenciaClp,
    alcanza: capitalAsignadoUf >= totalVpUf,
    estadoBalance,
    desembolsos: desembolsosCalculados,
    resumenTramos: Array.from(tramosMap.values()).filter((t) => t.cantidadDesembolsos > 0)
  };
}

// R03 y R06: proyecta la suficiencia del capital en escenarios Base, Adverso y Favorable
export function proyectarEscenariosMeta(
  meta: MetaFinanciera,
  supuestos: Supuestos,
  fechaCorte = '2026-09-30'
): ProyeccionMetasEscenarios {
  const resultadoBase = calcularPlanMeta(meta, supuestos, fechaCorte);
  const valorUf = supuestos.valor_uf_clp ?? (supuestos as any).uf?.valor_clp ?? (meta as any).valor_uf_clp ?? 40000;
  const capitalAsignadoUf = resultadoBase.capitalAsignadoUf;

  let listaEscenarios: Array<{ clave: string; nombre: string; ajuste_retorno_pp: number }> = [];

  if (Array.isArray(supuestos.escenarios)) {
    listaEscenarios = supuestos.escenarios.map((e: any) => ({
      clave: e.id ?? 'base',
      nombre: e.nombre ?? (e.id ? e.id.charAt(0).toUpperCase() + e.id.slice(1) : 'Base'),
      ajuste_retorno_pp: e.ajuste_retorno_pp ?? 0
    }));
  } else if (supuestos.escenarios && typeof supuestos.escenarios === 'object') {
    listaEscenarios = Object.entries(supuestos.escenarios).map(([k, v]: [string, any]) => ({
      clave: k,
      nombre: v.nombre ?? (k.charAt(0).toUpperCase() + k.slice(1)),
      ajuste_retorno_pp: v.ajuste_retorno_pp ?? 0
    }));
  } else {
    listaEscenarios = [
      { clave: 'base', nombre: 'Base', ajuste_retorno_pp: 0 },
      { clave: 'adverso', nombre: 'Adverso', ajuste_retorno_pp: -1.5 },
      { clave: 'favorable', nombre: 'Favorable', ajuste_retorno_pp: 1.5 }
    ];
  }

  const escenarios: Record<string, DetalleEscenarioMeta> = {};

  for (const esc of listaEscenarios) {
    const ajuste = esc.ajuste_retorno_pp;
    let totalVpUf = 0;

    for (const d of meta.desembolsos) {
      const { anios, meses } = calcularTiempo(fechaCorte, d.fecha);
      const tramo = asignarTramo(meses, supuestos);
      const cats = tramo.categorias_permitidas ?? tramo.categorias ?? [];
      const tasaBaseTramo = obtenerRetornoTramoPct(cats, supuestos);

      // Ajuste de tasa real anual segun el escenario analizado
      const tasaAjustada = Math.max(0, tasaBaseTramo + ajuste);
      const factorDescuento = Math.pow(1 + tasaAjustada / 100, anios);
      const montoUf = d.monto_uf ?? d.uf ?? 0;
      const vpUf = Number((montoUf / factorDescuento).toFixed(2));
      totalVpUf += vpUf;
    }

    totalVpUf = Number(totalVpUf.toFixed(2));
    const totalVpClp = Math.round(totalVpUf * valorUf);
    const diferenciaUf = Number((capitalAsignadoUf - totalVpUf).toFixed(2));
    const diferenciaClp = Math.round(diferenciaUf * valorUf);

    let estadoBalance: 'superavit' | 'deficit' | 'justo' = 'justo';
    if (diferenciaUf > 1) {
      estadoBalance = 'superavit';
    } else if (diferenciaUf < -1) {
      estadoBalance = 'deficit';
    }

    escenarios[esc.clave] = {
      clave: esc.clave,
      nombre: esc.nombre,
      ajustePp: ajuste,
      totalVpUf,
      totalVpClp,
      diferenciaUf,
      diferenciaClp,
      alcanza: capitalAsignadoUf >= totalVpUf,
      estadoBalance
    };
  }

  return {
    resultadoBase,
    escenarios
  };
}
