import type {
  MetaFinanciera,
  Supuestos,
  ResultadoCalculoMetas,
  DesembolsoCalculado,
  ResumenTramoMeta,
  ProyeccionMetasEscenarios,
  DetalleEscenarioMeta,
  Catalogo,
  Acuerdos,
  CarteraSugeridaMeta,
  FondoAsignadoMeta
} from '../types/domain';
import { evaluarSerie } from './evaluadorSeries';

// Calcula la distancia exacta en anios y meses entre dos fechas
export function calcularTiempo(fechaInicioStr: string, fechaFinStr: string): { anios: number; meses: number } {
  const inicio = new Date(fechaInicioStr);
  const fin = new Date(fechaFinStr);
  const diffMs = fin.getTime() - inicio.getTime();
  const anios = Number((diffMs / (365.25 * 24 * 60 * 60 * 1000)).toFixed(4));
  const meses = Number((anios * 12).toFixed(1));
  return { anios, meses };
}

// R06: determina el tramo evaluando dinamicamente intervalos semiabiertos [desde, hasta) segun supuestos.json
export function asignarTramo(meses: number, supuestos: Supuestos) {
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
    const ret = cat ? (cat.retorno_real_bruto_pct ?? cat.retorno_real_pct ?? 0) : 0;
    return acc + ret;
  }, 0);
  return Number((suma / categoriasPermitidas.length).toFixed(4));
}

// R06 Paso 5: selecciona el fondo elegible mas economico del catalogo para las categorias del tramo
export function seleccionarMejorFondoTramo(
  categoriasPermitidas: string[],
  montoClp: number,
  catalogo: Catalogo,
  acuerdos: Acuerdos,
  plazoMeses: number,
  fechaCorte: string
) {
  const listaAcuerdos = acuerdos.acuerdos ?? acuerdos.distribucion ?? [];
  let mejor: {
    producto: any;
    serie: string;
    tacPct: number;
    categoria: string;
    liquidezDias: number;
    agf: string;
  } | null = null;

  for (const cat of categoriasPermitidas) {
    const prods = catalogo.productos.filter((p) => {
      if (p.categoria !== cat) return false;
      const agf = p.administradora ?? p.emisor;
      const ac = listaAcuerdos.find(
        (a: any) =>
          (a.emisor === agf || a.agf === agf) &&
          a.estado === 'active' &&
          (!a.vigente_desde || a.vigente_desde <= fechaCorte) &&
          (!a.vigente_hasta || a.vigente_hasta >= fechaCorte)
      );
      return !!ac;
    });

    for (const prod of prods) {
      // Validar liquidez respecto al horizonte del tramo
      if (prod.liquidez_dias > plazoMeses * 30) continue;

      for (const serie of prod.series) {
        const clienteDummy = { referencia: 'CLIENTE', perfil_riesgo: 'moderado', perfil_evaluado_el: fechaCorte, plan_apv: false };
        const ev = evaluarSerie(prod, serie, montoClp, clienteDummy, acuerdos, null, fechaCorte);
        if (ev.estado === 'eligible') {
          if (!mejor || ev.tac_pct < mejor.tacPct) {
            mejor = {
              producto: prod,
              serie: ev.codigo,
              tacPct: ev.tac_pct,
              categoria: prod.categoria,
              liquidezDias: prod.liquidez_dias,
              agf: prod.administradora ?? prod.emisor
            };
          }
        }
      }
    }
  }

  return mejor;
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

    const tasaRealPct = tasaPlanaPct !== undefined
      ? tasaPlanaPct
      : obtenerRetornoTramoPct(cats, supuestos);

    const montoUf = d.monto_uf ?? d.uf ?? 0;
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

  const diferenciaUf = Number((capitalAsignadoUf - totalVpUf).toFixed(2));
  const diferenciaClp = Math.round(diferenciaUf * valorUf);

  let estadoBalance: 'superavit' | 'deficit' | 'justo' = 'justo';
  if (diferenciaUf > 1) {
    estadoBalance = 'superavit';
  } else if (diferenciaUf < -1) {
    estadoBalance = 'deficit';
  }

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

// R06 Pasos 3 a 6: construye la cartera para fondear la meta y valida el limite de crecimiento
export function construirCarteraMeta(
  meta: MetaFinanciera,
  supuestos: Supuestos,
  catalogo: Catalogo,
  acuerdos: Acuerdos,
  perfilRiesgo = 'moderado',
  fechaCorte = '2026-09-30'
): CarteraSugeridaMeta {
  const plan = calcularPlanMeta(meta, supuestos, fechaCorte);
  const valorUf = plan.valorUfClp;
  const capitalTotalUf = plan.capitalAsignadoUf;
  const superavitUf = Math.max(0, plan.diferenciaUf);

  const tramosActivos = plan.resumenTramos;
  const idTramoMasLargo = tramosActivos[tramosActivos.length - 1]?.tramoId;

  const asignaciones: FondoAsignadoMeta[] = [];
  const alertas: string[] = [];

  for (const tramo of tramosActivos) {
    // R06 Paso 4: si hay superavit, el excedente se asigna al tramo de mayor horizonte
    const excedente = tramo.tramoId === idTramoMasLargo ? superavitUf : 0;
    const asignacionUf = Number((tramo.totalVpUf + excedente).toFixed(2));
    const asignacionClp = Math.round(asignacionUf * valorUf);
    const pesoPct = capitalTotalUf > 0 ? Number(((asignacionUf / capitalTotalUf) * 100).toFixed(2)) : 0;

    const tramoDef = supuestos.tramos.find((t) => t.id === tramo.tramoId);
    const plazoMeses = tramoDef?.desde_meses ?? 36;

    // R06 Paso 5: elegir fondo elegible mas economico de administradoras con convenio
    const mejorFondo = seleccionarMejorFondoTramo(
      tramo.categoriasPermitidas,
      asignacionClp,
      catalogo,
      acuerdos,
      plazoMeses,
      fechaCorte
    );

    if (mejorFondo) {
      const catConfig = (supuestos.categorias as any)?.[mejorFondo.categoria];
      const pesoCrec = catConfig?.peso_crecimiento ?? 0;
      const volPct = catConfig?.volatilidad_pct ?? 0;

      asignaciones.push({
        tramoId: tramo.tramoId,
        tramoNombre: tramo.nombre,
        idProducto: mejorFondo.producto.id,
        nombreProducto: mejorFondo.producto.nombre,
        agf: mejorFondo.agf,
        serie: mejorFondo.serie,
        tacPct: mejorFondo.tacPct,
        categoria: mejorFondo.categoria,
        liquidezDias: mejorFondo.liquidezDias,
        capitalAsignadoUf: asignacionUf,
        capitalAsignadoClp: asignacionClp,
        pesoCarteraPct: pesoPct,
        pesoCrecimiento: pesoCrec,
        volatilidadPct: volPct
      });
    } else {
      alertas.push(`No se halló fondo elegible con acuerdo para el tramo ${tramo.tramoId}`);
    }
  }

  // R06 Paso 6: calculo del peso de crecimiento de la cartera
  const pesoCrecimientoTotal = asignaciones.reduce(
    (acc, a) => acc + (a.pesoCarteraPct * a.pesoCrecimiento),
    0
  );
  const pesoCrecimientoCarteraPct = Number(pesoCrecimientoTotal.toFixed(2));

  // Limite del perfil en supuestos.json
  const perfilesConf = (supuestos as any).perfiles ?? { moderado: { max_crecimiento_pct: 50 } };
  let maxPermitido = perfilesConf[perfilRiesgo]?.max_crecimiento_pct ?? 50;

  // Si faltan menos de 24 meses para el primer desembolso, el tope se reduce a la mitad
  const primerDesembolsoMeses = plan.desembolsos[0]?.mesesDesdeCorte ?? 60;
  const aplicaReduccion24Meses = primerDesembolsoMeses < 24;
  if (aplicaReduccion24Meses) {
    maxPermitido = Number((maxPermitido * 0.5).toFixed(2));
  }

  const cumplePerfilCrecimiento = pesoCrecimientoCarteraPct <= maxPermitido;
  if (!cumplePerfilCrecimiento) {
    alertas.push(
      `Peso de crecimiento (${pesoCrecimientoCarteraPct}%) excede el límite permitido para perfil ${perfilRiesgo} (${maxPermitido}%)`
    );
  }

  const tacPond = asignaciones.reduce((acc, a) => acc + (a.pesoCarteraPct * a.tacPct), 0) / 100;
  const volPond = asignaciones.reduce((acc, a) => acc + (a.pesoCarteraPct * a.volatilidadPct), 0) / 100;

  return {
    asignaciones,
    pesoCrecimientoCarteraPct,
    maxCrecimientoPermitidoPct: maxPermitido,
    aplicaReduccion24Meses,
    cumplePerfilCrecimiento,
    tacPonderadaMetaPct: Number(tacPond.toFixed(4)),
    volatilidadPonderadaMetaPct: Number(volPond.toFixed(2)),
    alertas
  };
}

// Proyeccion de escenarios de retorno real
export function proyectarEscenariosMeta(
  meta: MetaFinanciera,
  supuestos: Supuestos,
  fechaCorte = '2026-09-30'
): ProyeccionMetasEscenarios {
  const resultadoBase = calcularPlanMeta(meta, supuestos, fechaCorte);
  const valorUf = resultadoBase.valorUfClp;
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
