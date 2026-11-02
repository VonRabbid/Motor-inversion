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
  FondoAsignadoMeta,
  Cliente
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

export interface CandidatoTramo {
  producto: any;
  serie: string;
  tacPct: number;
  categoria: string;
  liquidezDias: number;
  agf: string;
  pesoCrecimiento: number;
  volatilidadPct: number;
}

// Obtiene todos los fondos elegibles para las categorias permitidas de un tramo
export function obtenerCandidatosTramo(
  categoriasPermitidas: string[],
  montoClp: number,
  catalogo: Catalogo,
  acuerdos: Acuerdos,
  plazoMeses: number,
  cliente: Cliente,
  fechaCorte: string,
  supuestos: Supuestos
): CandidatoTramo[] {
  const listaAcuerdos = acuerdos.acuerdos ?? acuerdos.distribucion ?? [];
  const candidatos: CandidatoTramo[] = [];

  for (const cat of categoriasPermitidas) {
    const catConfig = (supuestos.categorias as any)?.[cat];
    const pesoCrec = catConfig?.peso_crecimiento ?? 0;
    const volPct = catConfig?.volatilidad_pct ?? 0;

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
      if (prod.liquidez_dias > plazoMeses * 30) continue;

      for (const serie of prod.series) {
        const ev = evaluarSerie(prod, serie, montoClp, cliente, acuerdos, null, fechaCorte);
        if (ev.estado === 'eligible') {
          candidatos.push({
            producto: prod,
            serie: ev.codigo,
            tacPct: ev.tac_pct,
            categoria: prod.categoria,
            liquidezDias: prod.liquidez_dias,
            agf: prod.administradora ?? prod.emisor,
            pesoCrecimiento: pesoCrec,
            volatilidadPct: volPct
          });
        }
      }
    }
  }

  return candidatos;
}

// R06 Paso 5: selecciona el fondo elegible mas economico del catalogo para las categorias del tramo
export function seleccionarMejorFondoTramo(
  categoriasPermitidas: string[],
  montoClp: number,
  catalogo: Catalogo,
  acuerdos: Acuerdos,
  plazoMeses: number,
  clienteOFecha: Cliente | string = '2026-09-30',
  fechaCorte = '2026-09-30',
  supuestosDummy?: Supuestos
) {
  const cliente: Cliente = typeof clienteOFecha === 'object'
    ? clienteOFecha
    : { referencia: 'CLIENTE', perfil_riesgo: 'moderado', perfil_evaluado_el: fechaCorte, plan_apv: false };
  const fecha = typeof clienteOFecha === 'string' ? clienteOFecha : fechaCorte;
  const sup: Supuestos = supuestosDummy ?? {
    tramos: [],
    categorias: {}
  };

  const candidatos = obtenerCandidatosTramo(
    categoriasPermitidas,
    montoClp,
    catalogo,
    acuerdos,
    plazoMeses,
    cliente,
    fecha,
    sup
  );

  candidatos.sort((a, b) => a.tacPct - b.tacPct);
  return candidatos[0] ?? null;
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

// R06 Pasos 3 a 6: construye la cartera para fondear la meta respetando limites por fondo (40%) y AGF (60%)
export function construirCarteraMeta(
  meta: MetaFinanciera,
  supuestos: Supuestos,
  catalogo: Catalogo,
  acuerdos: Acuerdos,
  clienteOPerfil: Cliente | string = 'moderado',
  fechaCorte = '2026-09-30'
): CarteraSugeridaMeta {
  const cliente: Cliente = typeof clienteOPerfil === 'string'
    ? { referencia: 'CLIENTE', perfil_riesgo: clienteOPerfil, perfil_evaluado_el: fechaCorte, plan_apv: false }
    : clienteOPerfil;

  const perfilRiesgo = cliente.perfil_riesgo ?? 'moderado';

  const plan = calcularPlanMeta(meta, supuestos, fechaCorte);
  const valorUf = plan.valorUfClp;
  const capitalTotalUf = plan.capitalAsignadoUf;
  const superavitUf = Math.max(0, plan.diferenciaUf);

  const limiteMaxFondoPct = supuestos?.limites?.max_por_fondo_pct ?? 40;
  const limiteMaxAgfPct = supuestos?.limites?.max_por_agf_pct ?? 60;
  const maxPorFondoUf = Number(((capitalTotalUf * limiteMaxFondoPct) / 100).toFixed(2));
  const maxPorAgfUf = Number(((capitalTotalUf * limiteMaxAgfPct) / 100).toFixed(2));

  // Tope de crecimiento segun perfil y horizonte temporal
  const perfilesConf = (supuestos as any).perfiles ?? { moderado: { max_crecimiento_pct: 50 } };
  let maxPermitido = perfilesConf[perfilRiesgo]?.max_crecimiento_pct ?? 50;

  const primerDesembolsoMeses = plan.desembolsos[0]?.mesesDesdeCorte ?? 60;
  const aplicaReduccion24Meses = primerDesembolsoMeses < 24;
  if (aplicaReduccion24Meses) {
    maxPermitido = Number((maxPermitido * 0.5).toFixed(2));
  }

  const tramosActivos = plan.resumenTramos;
  const idTramoMasLargo = tramosActivos[tramosActivos.length - 1]?.tramoId;

  const asignaciones: FondoAsignadoMeta[] = [];
  const alertas: string[] = [];
  const acumFondoUf: Record<string, number> = {};
  const acumAgfUf: Record<string, number> = {};

  for (const tramo of tramosActivos) {
    const excedente = tramo.tramoId === idTramoMasLargo ? superavitUf : 0;
    const asignacionTotalTramoUf = Number((tramo.totalVpUf + excedente).toFixed(2));
    let faltanteTramoUf = asignacionTotalTramoUf;

    const tramoDef = supuestos.tramos.find((t) => t.id === tramo.tramoId);
    const plazoMeses = tramoDef?.desde_meses ?? 36;

    // Obtener todos los candidatos del tramo
    const candidatos = obtenerCandidatosTramo(
      tramo.categoriasPermitidas,
      Math.round(asignacionTotalTramoUf * valorUf),
      catalogo,
      acuerdos,
      plazoMeses,
      cliente,
      fechaCorte,
      supuestos
    );

    // En T4, si se requiere cumplir con un perfil restrictivo, priorizar balanceado (peso 0.5) sobre renta variable (peso 1)
    if (tramo.tramoId === idTramoMasLargo && aplicaReduccion24Meses) {
      candidatos.sort((a, b) => {
        if (a.pesoCrecimiento !== b.pesoCrecimiento) {
          return a.pesoCrecimiento - b.pesoCrecimiento;
        }
        return a.tacPct - b.tacPct;
      });
    } else {
      candidatos.sort((a, b) => a.tacPct - b.tacPct);
    }

    for (const cand of candidatos) {
      if (faltanteTramoUf <= 0.005) break;

      const asignadoFondoActual = acumFondoUf[cand.producto.id] ?? 0;
      const asignadoAgfActual = acumAgfUf[cand.agf] ?? 0;

      const capacidadFondo = Math.max(0, maxPorFondoUf - asignadoFondoActual);
      const capacidadAgf = Math.max(0, maxPorAgfUf - asignadoAgfActual);

      let asignableUf = Math.min(faltanteTramoUf, capacidadFondo, capacidadAgf);
      asignableUf = Number(asignableUf.toFixed(2));

      if (asignableUf > 0.005) {
        acumFondoUf[cand.producto.id] = asignadoFondoActual + asignableUf;
        acumAgfUf[cand.agf] = asignadoAgfActual + asignableUf;
        faltanteTramoUf = Number((faltanteTramoUf - asignableUf).toFixed(2));

        const asignableClp = Math.round(asignableUf * valorUf);
        const pesoPct = capitalTotalUf > 0 ? Number(((asignableUf / capitalTotalUf) * 100).toFixed(2)) : 0;

        asignaciones.push({
          tramoId: tramo.tramoId,
          tramoNombre: tramo.nombre,
          idProducto: cand.producto.id,
          nombreProducto: cand.producto.nombre,
          agf: cand.agf,
          serie: cand.serie,
          tacPct: cand.tacPct,
          categoria: cand.categoria,
          liquidezDias: cand.liquidezDias,
          capitalAsignadoUf: asignableUf,
          capitalAsignadoClp: asignableClp,
          pesoCarteraPct: pesoPct,
          pesoCrecimiento: cand.pesoCrecimiento,
          volatilidadPct: cand.volatilidadPct
        });
      }
    }

    // Si persiste remanente por limite estricto de cupos, asignar al candidato de menor TAC
    if (faltanteTramoUf > 0.01 && candidatos.length > 0) {
      const cand = candidatos[0];
      const asignableUf = Number(faltanteTramoUf.toFixed(2));
      acumFondoUf[cand.producto.id] = (acumFondoUf[cand.producto.id] ?? 0) + asignableUf;
      acumAgfUf[cand.agf] = (acumAgfUf[cand.agf] ?? 0) + asignableUf;
      faltanteTramoUf = 0;

      const asignableClp = Math.round(asignableUf * valorUf);
      const pesoPct = capitalTotalUf > 0 ? Number(((asignableUf / capitalTotalUf) * 100).toFixed(2)) : 0;

      asignaciones.push({
        tramoId: tramo.tramoId,
        tramoNombre: tramo.nombre,
        idProducto: cand.producto.id,
        nombreProducto: cand.producto.nombre,
        agf: cand.agf,
        serie: cand.serie,
        tacPct: cand.tacPct,
        categoria: cand.categoria,
        liquidezDias: cand.liquidezDias,
        capitalAsignadoUf: asignableUf,
        capitalAsignadoClp: asignableClp,
        pesoCarteraPct: pesoPct,
        pesoCrecimiento: cand.pesoCrecimiento,
        volatilidadPct: cand.volatilidadPct
      });
    } else if (faltanteTramoUf > 0.01) {
      alertas.push(`No se halló fondo elegible con acuerdo para el tramo ${tramo.tramoId}`);
    }
  }

  // R06 Paso 6: calculo del peso de crecimiento de la cartera
  const pesoCrecimientoTotal = asignaciones.reduce(
    (acc, a) => acc + (a.pesoCarteraPct * a.pesoCrecimiento),
    0
  );
  const pesoCrecimientoCarteraPct = Number(pesoCrecimientoTotal.toFixed(2));

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

// Proyeccion de escenarios de retorno real y simulacion anual del saldo segun R03
export function proyectarEscenariosMeta(
  meta: MetaFinanciera,
  supuestos: Supuestos,
  fechaCorte = '2026-09-30',
  carteraMeta?: CarteraSugeridaMeta
): ProyeccionMetasEscenarios {
  const resultadoBase = calcularPlanMeta(meta, supuestos, fechaCorte);
  const valorUf = resultadoBase.valorUfClp;
  const capitalAsignadoUf = resultadoBase.capitalAsignadoUf;
  const totalDesembolsosUf = resultadoBase.totalDesembolsosUf;

  const tacPonderada = carteraMeta ? carteraMeta.tacPonderadaMetaPct : 1.0;
  let retornoBrutoBase = 3.4;
  if (carteraMeta && carteraMeta.asignaciones.length > 0) {
    retornoBrutoBase = carteraMeta.asignaciones.reduce((acc, a) => {
      const cat = (supuestos.categorias as any)?.[a.categoria];
      const ret = cat?.retorno_real_bruto_pct ?? cat?.retorno_real_pct ?? 0;
      return acc + (a.pesoCarteraPct * ret) / 100;
    }, 0);
  } else if (resultadoBase.desembolsos.length > 0) {
    retornoBrutoBase = resultadoBase.desembolsos.reduce((acc, d) => acc + d.retornoRealAplicadoPct, 0) / resultadoBase.desembolsos.length;
  }

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
  const idTramoMasLargo = resultadoBase.resumenTramos[resultadoBase.resumenTramos.length - 1]?.tramoId;
  const superavitUf = Math.max(0, resultadoBase.diferenciaUf);

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

    // Simulacion anual de saldos por tramos calzados (R03 y R06)
    const retornoRealNetoSupuestoPct = Number((retornoBrutoBase + ajuste - tacPonderada).toFixed(2));

    // Estructura de saldo por tramo con su respectivo retorno real bruto + ajuste
    const saldosTramos: Record<string, { saldoUf: number; tasaNetaPct: number }> = {};
    for (const tr of resultadoBase.resumenTramos) {
      const tasaBruta = obtenerRetornoTramoPct(tr.categoriasPermitidas, supuestos);
      const tasaNeta = Math.max(0, tasaBruta + ajuste);
      const excedente = tr.tramoId === idTramoMasLargo ? superavitUf : 0;
      saldosTramos[tr.tramoId] = {
        saldoUf: Number((tr.totalVpUf + excedente).toFixed(2)),
        tasaNetaPct: tasaNeta
      };
    }

    const fechaCorteDate = new Date(fechaCorte);
    let costoAcumuladoUf = 0;
    let ufPagadasConExito = 0;
    let fechaAgotamiento: string | null = null;

    for (let año = 1; año <= 12; año++) {
      const inicioPeriodo = new Date(fechaCorteDate);
      inicioPeriodo.setFullYear(inicioPeriodo.getFullYear() + (año - 1));

      const finPeriodo = new Date(fechaCorteDate);
      finPeriodo.setFullYear(finPeriodo.getFullYear() + año);

      const saldoInicialPeriodo = Object.values(saldosTramos).reduce((acc, s) => acc + s.saldoUf, 0);

      // Rendimiento anual en cada tramo
      for (const s of Object.values(saldosTramos)) {
        if (s.saldoUf > 0) {
          s.saldoUf = s.saldoUf * (1 + s.tasaNetaPct / 100);
        }
      }

      // Desembolsos programados en este año
      const desembolsosDelAño = resultadoBase.desembolsos.filter((d) => {
        const dDate = new Date(d.fecha);
        return dDate >= inicioPeriodo && dDate < finPeriodo;
      });

      for (const d of desembolsosDelAño) {
        const montoPagoUf = d.montoUf;
        const sTramo = saldosTramos[d.tramoId];

        if (sTramo && sTramo.saldoUf >= montoPagoUf) {
          sTramo.saldoUf -= montoPagoUf;
          ufPagadasConExito += montoPagoUf;
        } else {
          let remanente = montoPagoUf;
          if (sTramo && sTramo.saldoUf > 0) {
            ufPagadasConExito += sTramo.saldoUf;
            remanente -= sTramo.saldoUf;
            sTramo.saldoUf = 0;
          }

          // Cubrir remanente desde el tramo mas largo (superavit)
          const sLargo = saldosTramos[idTramoMasLargo];
          if (sLargo && sLargo.saldoUf >= remanente) {
            sLargo.saldoUf -= remanente;
            ufPagadasConExito += remanente;
          } else if (sLargo && sLargo.saldoUf > 0) {
            ufPagadasConExito += sLargo.saldoUf;
            sLargo.saldoUf = 0;
            if (fechaAgotamiento === null) fechaAgotamiento = d.fecha;
          } else {
            if (fechaAgotamiento === null) fechaAgotamiento = d.fecha;
          }
        }
      }

      const saldoFinalPeriodo = Object.values(saldosTramos).reduce((acc, s) => acc + s.saldoUf, 0);
      const saldoMedio = (saldoInicialPeriodo + saldoFinalPeriodo) / 2;
      costoAcumuladoUf += saldoMedio * (tacPonderada / 100);
    }

    const saldoFinalTotalUf = Number(
      Object.values(saldosTramos).reduce((acc, s) => acc + s.saldoUf, 0).toFixed(2)
    );
    const porcentajeCoberturaPct = totalDesembolsosUf > 0
      ? Number(((ufPagadasConExito / totalDesembolsosUf) * 100).toFixed(2))
      : 0;

    const costoFinalUf = Number(costoAcumuladoUf.toFixed(2));
    const costoFinalClp = Math.round(costoFinalUf * valorUf);

    escenarios[esc.clave] = {
      clave: esc.clave,
      nombre: esc.nombre,
      ajustePp: ajuste,
      totalVpUf,
      totalVpClp,
      diferenciaUf,
      diferenciaClp,
      alcanza: capitalAsignadoUf >= totalVpUf,
      estadoBalance,
      saldoFinalUf: saldoFinalTotalUf,
      fechaAgotamiento,
      porcentajeCoberturaPct,
      retornoRealNetoSupuestoPct,
      costoAcumuladoUf: costoFinalUf,
      costoAcumuladoClp: costoFinalClp
    };
  }

  return {
    resultadoBase,
    escenarios
  };
}
