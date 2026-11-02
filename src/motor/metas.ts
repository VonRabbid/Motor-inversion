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
  Cliente,
  ProductoCatalogo
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

// R01: depositos a plazo y efectivo no dependen de un acuerdo de AGF y siempre son proponibles
export function esProductoSinAgf(producto: Pick<ProductoCatalogo, 'tipo'>): boolean {
  return producto.tipo === 'time_deposit' || producto.tipo === 'cash';
}

interface SerieSeleccionada {
  serie: string;
  tacPct: number;
}

// R04: re-evalua todas las series del producto con el monto efectivo del fragmento
function seleccionarSerieParaMonto(
  cand: CandidatoTramo,
  montoClp: number,
  cliente: Cliente,
  acuerdos: Acuerdos,
  fechaCorte: string
): SerieSeleccionada | null {
  const producto = cand.producto as ProductoCatalogo;

  if (esProductoSinAgf(producto)) {
    return { serie: 'Única', tacPct: 0 };
  }

  const elegibles = (producto.series ?? [])
    .map((serie) => evaluarSerie(producto, serie, montoClp, cliente, acuerdos, null, fechaCorte))
    .filter((ev) => ev.estado === 'eligible')
    .sort((a, b) => a.tac_pct - b.tac_pct);

  if (elegibles.length === 0) return null;

  return {
    serie: elegibles[0].codigo,
    tacPct: elegibles[0].tac_pct
  };
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

    const prods = catalogo.productos.filter((p) => p.categoria === cat);

    for (const prod of prods) {
      // R01: la liquidez es la unica restriccion para productos sin AGF
      if (prod.liquidez_dias > plazoMeses * 30) continue;

      const agf = prod.administradora ?? prod.emisor;

      if (esProductoSinAgf(prod)) {
        candidatos.push({
          producto: prod,
          serie: 'Única',
          tacPct: 0,
          categoria: prod.categoria,
          liquidezDias: prod.liquidez_dias,
          agf,
          pesoCrecimiento: pesoCrec,
          volatilidadPct: volPct
        });
        continue;
      }

      const acuerdo = listaAcuerdos.find(
        (a: any) =>
          (a.emisor === agf || a.agf === agf) &&
          a.estado === 'active' &&
          (!a.vigente_desde || a.vigente_desde <= fechaCorte) &&
          (!a.vigente_hasta || a.vigente_hasta >= fechaCorte)
      );
      if (!acuerdo) continue;

      for (const serie of prod.series) {
        const ev = evaluarSerie(prod, serie, montoClp, cliente, acuerdos, null, fechaCorte);
        if (ev.estado === 'eligible') {
          candidatos.push({
            producto: prod,
            serie: ev.codigo,
            tacPct: ev.tac_pct,
            categoria: prod.categoria,
            liquidezDias: prod.liquidez_dias,
            agf,
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

  const asignaciones: FondoAsignadoMeta[] = [];
  const alertas: string[] = [];
  const acumFondoUf: Record<string, number> = {};
  const acumAgfUf: Record<string, number> = {};
  let crecimientoAcumuladoPct = 0;

  // R06: si el plan no alcanza, el capital objetivo de cada tramo se escala al capital disponible
  const factorObjetivo = !plan.alcanza && plan.totalVpUf > 0
    ? capitalTotalUf / plan.totalVpUf
    : 1;

  const objetivosUf = tramosActivos.map((tramo) =>
    Number((tramo.totalVpUf * factorObjetivo).toFixed(2))
  );

  if (objetivosUf.length > 0) {
    const sumaObjetivos = objetivosUf.reduce((acc, monto) => acc + monto, 0);
    const ajusteRedondeo = Number((capitalTotalUf - sumaObjetivos).toFixed(2));
    objetivosUf[objetivosUf.length - 1] = Number(
      (objetivosUf[objetivosUf.length - 1] + ajusteRedondeo).toFixed(2)
    );
  }

  const categoriasRentaFija = Object.entries(supuestos.categorias ?? {})
    .filter(([, config]) => (config.peso_crecimiento ?? 0) === 0)
    .map(([categoria]) => categoria);

  const capacidadCrecimientoUf = (pesoCrecimiento: number): number => {
    if (pesoCrecimiento <= 0 || capitalTotalUf <= 0) return Number.POSITIVE_INFINITY;
    const margenPct = Math.max(0, maxPermitido - crecimientoAcumuladoPct);
    if (margenPct <= 0.0001) return 0;
    return (margenPct / pesoCrecimiento) * capitalTotalUf / 100;
  };

  const capacidadDisponibleUf = (cand: CandidatoTramo): number => {
    const asignadoFondoActual = acumFondoUf[cand.producto.id] ?? 0;
    const asignadoAgfActual = acumAgfUf[cand.agf] ?? 0;
    const capacidadFondo = Math.max(0, maxPorFondoUf - asignadoFondoActual);
    const capacidadAgf = Math.max(0, maxPorAgfUf - asignadoAgfActual);
    return Math.min(capacidadFondo, capacidadAgf, capacidadCrecimientoUf(cand.pesoCrecimiento));
  };

  const registrarAsignacion = (
    tramo: ResumenTramoMeta,
    cand: CandidatoTramo,
    asignableUf: number,
    seleccion: SerieSeleccionada
  ): void => {
    const asignableClp = Math.round(asignableUf * valorUf);
    const pesoPct = capitalTotalUf > 0
      ? Number(((asignableUf / capitalTotalUf) * 100).toFixed(2))
      : 0;

    asignaciones.push({
      tramoId: tramo.tramoId,
      tramoNombre: tramo.nombre,
      idProducto: cand.producto.id,
      nombreProducto: cand.producto.nombre,
      agf: cand.agf,
      serie: seleccion.serie,
      tacPct: seleccion.tacPct,
      categoria: cand.categoria,
      liquidezDias: cand.liquidezDias,
      capitalAsignadoUf: asignableUf,
      capitalAsignadoClp: asignableClp,
      pesoCarteraPct: pesoPct,
      pesoCrecimiento: cand.pesoCrecimiento,
      volatilidadPct: cand.volatilidadPct
    });

    acumFondoUf[cand.producto.id] = (acumFondoUf[cand.producto.id] ?? 0) + asignableUf;
    acumAgfUf[cand.agf] = (acumAgfUf[cand.agf] ?? 0) + asignableUf;

    if (cand.pesoCrecimiento > 0) {
      crecimientoAcumuladoPct = Number(
        (crecimientoAcumuladoPct + pesoPct * cand.pesoCrecimiento).toFixed(4)
      );
    }
  };

  for (let idx = 0; idx < tramosActivos.length; idx++) {
    const tramo = tramosActivos[idx];
    let faltanteTramoUf = Math.max(0, objetivosUf[idx] ?? 0);

    const tramoDef = supuestos.tramos.find((t) => t.id === tramo.tramoId);
    const plazoMeses = tramoDef?.desde_meses ?? 36;

    // Obtener todos los candidatos del tramo
    const candidatos = obtenerCandidatosTramo(
      tramo.categoriasPermitidas,
      Math.round(faltanteTramoUf * valorUf),
      catalogo,
      acuerdos,
      plazoMeses,
      cliente,
      fechaCorte,
      supuestos
    );

    // R06 Paso 6: con perfiles restrictivos se prefieren candidatos de menor peso de crecimiento
    const priorizarMenorCrecimiento = maxPermitido < 50 || aplicaReduccion24Meses;
    if (priorizarMenorCrecimiento) {
      candidatos.sort((a, b) => {
        if (a.pesoCrecimiento !== b.pesoCrecimiento) {
          return a.pesoCrecimiento - b.pesoCrecimiento;
        }
        return a.tacPct - b.tacPct;
      });
    } else {
      candidatos.sort((a, b) => a.tacPct - b.tacPct);
    }

    const productosUsados = new Set<string>();
    const productosVistos = new Set<string>();

    for (const cand of candidatos) {
      if (faltanteTramoUf <= 0.005) break;

      // Un unico fragmento por producto evita duplicar el mismo producto + serie
      if (productosVistos.has(cand.producto.id)) continue;
      productosVistos.add(cand.producto.id);

      const capacidad = capacidadDisponibleUf(cand);
      let asignableUf = Math.min(faltanteTramoUf, capacidad);
      asignableUf = Number((Math.floor(asignableUf * 100) / 100).toFixed(2));

      if (asignableUf <= 0.005) continue;

      // R04: la serie se revalida con el monto real del fragmento, no con el total del tramo
      const asignableClp = Math.round(asignableUf * valorUf);
      const seleccion = seleccionarSerieParaMonto(cand, asignableClp, cliente, acuerdos, fechaCorte);
      if (!seleccion) continue;

      registrarAsignacion(tramo, cand, asignableUf, seleccion);
      faltanteTramoUf = Number((faltanteTramoUf - asignableUf).toFixed(2));
      productosUsados.add(cand.producto.id);
    }

    // R06 Paso 6: si el cupo de crecimiento se agota, el remanente va a renta fija (peso 0)
    if (faltanteTramoUf > 0.005) {
      const cupoAgotado = maxPermitido - crecimientoAcumuladoPct <= 0.005;
      const huboCandidatosCrecimiento = candidatos.some((cand) => cand.pesoCrecimiento > 0);

      if (cupoAgotado || huboCandidatosCrecimiento) {
        // R06: el reemplazo debe pertenecer a las categorias permitidas del tramo.
        // No se puede usar una categoria de otro tramo solo por ser renta fija.
        const categoriasRentaFijaTramo = categoriasRentaFija.filter((cat) =>
          tramo.categoriasPermitidas.includes(cat)
        );

        if (categoriasRentaFijaTramo.length > 0) {
          const candidatosRentaFija = obtenerCandidatosTramo(
            categoriasRentaFijaTramo,
            Math.round(faltanteTramoUf * valorUf),
            catalogo,
            acuerdos,
            plazoMeses,
            cliente,
            fechaCorte,
            supuestos
          ).filter(
            (cand) =>
              cand.pesoCrecimiento === 0 && !productosUsados.has(cand.producto.id)
          );

          const fondosRentaFija = candidatosRentaFija.filter(
            (cand) => !esProductoSinAgf(cand.producto)
          );
          const listaRentaFija = (fondosRentaFija.length > 0 ? fondosRentaFija : candidatosRentaFija)
            .sort((a, b) => a.tacPct - b.tacPct);

          const productosFallbackVistos = new Set<string>();
          const fondosAsignadosFallback = new Set<string>();
          let asignadoFallbackUf = 0;

          for (const cand of listaRentaFija) {
            if (faltanteTramoUf <= 0.005) break;
            if (productosFallbackVistos.has(cand.producto.id)) continue;
            productosFallbackVistos.add(cand.producto.id);

            const capacidad = capacidadDisponibleUf(cand);
            let asignableUf = Math.min(faltanteTramoUf, capacidad);
            asignableUf = Number((Math.floor(asignableUf * 100) / 100).toFixed(2));

            if (asignableUf <= 0.005) continue;

            const asignableClp = Math.round(asignableUf * valorUf);
            const seleccion = seleccionarSerieParaMonto(cand, asignableClp, cliente, acuerdos, fechaCorte);
            if (!seleccion) continue;

            registrarAsignacion(tramo, cand, asignableUf, seleccion);
            faltanteTramoUf = Number((faltanteTramoUf - asignableUf).toFixed(2));
            asignadoFallbackUf = Number((asignadoFallbackUf + asignableUf).toFixed(2));
            fondosAsignadosFallback.add(cand.producto.nombre);
          }

          if (asignadoFallbackUf > 0) {
            const nombresFondos = Array.from(fondosAsignadosFallback).join(', ');
            if (cupoAgotado) {
              alertas.push(
                `Tramo ${tramo.tramoId}: el cupo de crecimiento del perfil ${perfilRiesgo} (${maxPermitido}%) se agotó; se asignaron ${asignadoFallbackUf} UF a renta fija (${nombresFondos}) para no exceder el perfil`
              );
            } else {
              alertas.push(
                `Tramo ${tramo.tramoId}: el remanente se asignó a renta fija (${nombresFondos}) respetando los límites de concentración`
              );
            }
          }
        }
      }
    }

    if (faltanteTramoUf > 0.01) {
      alertas.push(
        `Tramo ${tramo.tramoId}: quedaron ${faltanteTramoUf.toFixed(2)} UF sin asignar; no se halló fondo elegible con acuerdo dentro de las categorías permitidas`
      );
    }
  }

  // R06 Paso 6: calculo del peso de crecimiento de la cartera
  const pesoCrecimientoCarteraPct = Number(crecimientoAcumuladoPct.toFixed(2));
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

  // R03/R06: la simulacion parte del capital efectivamente asignado por la cartera
  // sugerida. En deficit no se puede simular el VP teorico completo como si estuviera financiado.
  const factorCapitalBase = resultadoBase.totalVpUf > 0
    ? Math.min(1, capitalAsignadoUf / resultadoBase.totalVpUf)
    : 1;
  const capitalAsignadoPorTramo: Record<string, number> = {};
  if (carteraMeta) {
    for (const a of carteraMeta.asignaciones) {
      capitalAsignadoPorTramo[a.tramoId] = Number(
        ((capitalAsignadoPorTramo[a.tramoId] ?? 0) + a.capitalAsignadoUf).toFixed(2)
      );
    }
  }

  // R03: TAC ponderada de los fondos asignados a cada tramo
  const calcularTacTramoPct = (tramoId: string): number => {
    if (!carteraMeta || carteraMeta.asignaciones.length === 0) return tacPonderada;
    const asignacionesTramo = carteraMeta.asignaciones.filter((a) => a.tramoId === tramoId);
    const capitalTramoUf = asignacionesTramo.reduce((acc, a) => acc + a.capitalAsignadoUf, 0);
    if (capitalTramoUf <= 0) return tacPonderada;
    return asignacionesTramo.reduce(
      (acc, a) => acc + (a.capitalAsignadoUf * a.tacPct) / capitalTramoUf,
      0
    );
  };

  for (const esc of listaEscenarios) {
    const ajuste = esc.ajuste_retorno_pp;
    let totalVpUf = 0;

    for (const d of meta.desembolsos) {
      const { anios, meses } = calcularTiempo(fechaCorte, d.fecha);
      const tramo = asignarTramo(meses, supuestos);
      const cats = tramo.categorias_permitidas ?? tramo.categorias ?? [];
      const tasaBaseTramo = obtenerRetornoTramoPct(cats, supuestos);

      const tasaAjustada = tasaBaseTramo + ajuste;
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

    // Estructura de saldo por tramo con su respectivo retorno real bruto + ajuste.
    // Si existe cartera sugerida se usa su capital asignado; si no, se usa el VP
    // escalado al capital disponible y el superavit se concentra en el tramo mas largo.
    const saldosTramos: Record<string, { saldoUf: number; tasaNetaPct: number }> = {};
    for (const tr of resultadoBase.resumenTramos) {
      const tasaBruta = obtenerRetornoTramoPct(tr.categoriasPermitidas, supuestos);
      const tasaNeta = tasaBruta + ajuste - calcularTacTramoPct(tr.tramoId);
      const saldoInicial = carteraMeta
        ? (capitalAsignadoPorTramo[tr.tramoId] ?? 0)
        : tr.totalVpUf * factorCapitalBase + (tr.tramoId === idTramoMasLargo ? superavitUf : 0);
      saldosTramos[tr.tramoId] = {
        saldoUf: Number(saldoInicial.toFixed(2)),
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
