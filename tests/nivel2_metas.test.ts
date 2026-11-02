import { describe, it, expect } from 'vitest';
import metaData from '../data/meta.json';
import supuestosData from '../data/supuestos.json';
import catalogoData from '../data/catalogo.json';
import acuerdosData from '../data/acuerdos.json';
import cartolaData from '../data/cartola.json';
import type { MetaFinanciera, Supuestos, Catalogo, Acuerdos, Cartola } from '../src/types/domain';
import {
  calcularPlanMeta,
  calcularTiempo,
  asignarTramo,
  proyectarEscenariosMeta,
  construirCarteraMeta,
  obtenerCandidatosTramo
} from '../src/motor/metas';

const meta = metaData as unknown as MetaFinanciera;
const supuestos = supuestosData as unknown as Supuestos;
const catalogo = catalogoData as unknown as Catalogo;
const acuerdos = acuerdosData as unknown as Acuerdos;
const cartola = cartolaData as unknown as Cartola;

describe('Nivel 2 — Calce de Plazos, VP y Construcción de Cartera (R06)', () => {
  it('Test 1: Calce temporal dinámico asigna desembolsos según intervalos semiabiertos de supuestos.json', () => {
    // 2031-03-01 está a ~53 meses de corte: pertenece a T2 [24, 60)
    const { meses: meses1 } = calcularTiempo('2026-09-30', '2031-03-01');
    expect(meses1).toBeGreaterThanOrEqual(24);
    expect(meses1).toBeLessThan(60);
    expect(asignarTramo(meses1, supuestos).id).toBe('T2');

    const res = calcularPlanMeta(meta, supuestos, '2026-09-30');
    expect(res.desembolsos[0].tramoId).toBe('T2');

    // Desembolsos 2032 a 2034 caen en T3 [60, 96)
    expect(res.desembolsos[1].tramoId).toBe('T3');
    expect(res.desembolsos[2].tramoId).toBe('T3');
    expect(res.desembolsos[3].tramoId).toBe('T3');

    // Desembolsos 2035 a 2038 caen en T4 [96, null)
    for (let i = 4; i < res.desembolsos.length; i++) {
      expect(res.desembolsos[i].tramoId).toBe('T4');
    }
  });

  it('Test 2: Total de desembolsos universitarios suma 2.200 UF (88.000.000 CLP)', () => {
    const res = calcularPlanMeta(meta, supuestos, '2026-09-30');
    expect(res.totalDesembolsosUf).toBe(2200);
    expect(res.totalDesembolsosClp).toBe(88_000_000);
    expect(res.capitalAsignadoUf).toBe(1750);
  });

  it('Test 3: Con tasa plana de 2,0% anual da déficit y con 3,5% da superávit', () => {
    const resBaja = calcularPlanMeta(meta, supuestos, '2026-09-30', 2.0);
    expect(resBaja.totalVpUf).toBeGreaterThan(1750);
    expect(resBaja.alcanza).toBe(false);
    expect(resBaja.estadoBalance).toBe('deficit');

    const resAlta = calcularPlanMeta(meta, supuestos, '2026-09-30', 3.5);
    expect(resAlta.totalVpUf).toBeLessThan(1750);
    expect(resAlta.alcanza).toBe(true);
    expect(resAlta.estadoBalance).toBe('superavit');
  });

  it('Test 4: Construcción de cartera (Pasos 3 a 5) respeta límites de 40% por fondo y 60% por AGF descartando Gamma', () => {
    const cartera = construirCarteraMeta(meta, supuestos, catalogo, acuerdos, 'moderado', '2026-09-30');
    expect(cartera.asignaciones.length).toBeGreaterThanOrEqual(3);

    // Ninguna posicion supera el 40% del capital total
    for (const a of cartera.asignaciones) {
      expect(a.pesoCarteraPct).toBeLessThanOrEqual(40.01);
    }

    // Ninguna AGF supera el 60% del capital total
    const acumPorAgf: Record<string, number> = {};
    for (const a of cartera.asignaciones) {
      acumPorAgf[a.agf] = (acumPorAgf[a.agf] ?? 0) + a.pesoCarteraPct;
    }
    for (const [agf, pct] of Object.entries(acumPorAgf)) {
      expect(pct).toBeLessThanOrEqual(60.01);
    }

    // Gamma descartado por no tener acuerdo
    expect(cartera.asignaciones.some((a) => a.agf === 'gamma')).toBe(false);
  });

  it('Test 5: Validación de límite de crecimiento para perfil moderado (Paso 6 R06)', () => {
    const cartera = construirCarteraMeta(meta, supuestos, catalogo, acuerdos, 'moderado', '2026-09-30');
    expect(cartera.pesoCrecimientoCarteraPct).toBeLessThanOrEqual(cartera.maxCrecimientoPermitidoPct);
    expect(cartera.cumplePerfilCrecimiento).toBe(true);
  });

  it('Test 6: Proyección de sensibilidad en escenarios y simulación anual de saldos y costos (R03 y R06)', () => {
    const cartera = construirCarteraMeta(meta, supuestos, catalogo, acuerdos, 'moderado', '2026-09-30');
    const proy = proyectarEscenariosMeta(meta, supuestos, '2026-09-30', cartera);

    expect(proy.escenarios['favorable'].totalVpUf).toBeLessThan(proy.escenarios['base'].totalVpUf);
    expect(proy.escenarios['base'].totalVpUf).toBeLessThan(proy.escenarios['adverso'].totalVpUf);
    expect(proy.escenarios['adverso'].alcanza).toBe(false);

    // Metricas de simulacion anual R03
    for (const esc of Object.values(proy.escenarios)) {
      expect(esc.porcentajeCoberturaPct).toBeGreaterThan(0);
      expect(esc.costoAcumuladoUf).toBeGreaterThan(0);
      expect(esc.costoAcumuladoClp).toBeGreaterThan(0);
      expect(esc.retornoRealNetoSupuestoPct).toBeDefined();
    }

    // En escenario adverso se agota antes de culminar
    expect(proy.escenarios['adverso'].porcentajeCoberturaPct).toBeLessThan(100);
    expect(proy.escenarios['adverso'].fechaAgotamiento).not.toBeNull();
    expect(proy.escenarios['adverso'].saldoFinalUf).toBe(0);

    // Al descontar la TAC, el escenario base queda levemente bajo el 100% y el favorable cubre todo
    expect(proy.escenarios['base'].porcentajeCoberturaPct).toBeGreaterThan(99);
    expect(proy.escenarios['favorable'].porcentajeCoberturaPct).toBe(100);
    expect(proy.escenarios['favorable'].fechaAgotamiento).toBeNull();
    expect(proy.escenarios['favorable'].saldoFinalUf).toBeGreaterThan(0);
  });

  it('Test 7: Cada fragmento asignado respeta el minimo_clp de su serie y no reutiliza series bloqueadas', () => {
    const cartera = construirCarteraMeta(meta, supuestos, catalogo, acuerdos, 'moderado', '2026-09-30');

    for (const asignacion of cartera.asignaciones) {
      const producto = catalogo.productos.find((p) => p.id === asignacion.idProducto);
      expect(producto).toBeDefined();

      if (producto!.tipo === 'time_deposit' || producto!.tipo === 'cash') {
        expect(asignacion.serie).toBe('Única');
        expect(asignacion.tacPct).toBe(0);
        continue;
      }

      const serie = producto!.series.find((s) => s.codigo === asignacion.serie);
      expect(serie).toBeDefined();
      expect(asignacion.capitalAsignadoClp).toBeGreaterThanOrEqual(serie!.minimo_clp ?? 0);
    }

    // El remanente de T3 no puede quedar en Alfa serie B con un ticket inferior a 5.000.000 CLP
    const t3 = cartera.asignaciones.filter((a) => a.tramoId === 'T3');
    expect(t3.some((a) => a.idProducto === 'alfa-deuda-uf' && a.serie === 'B')).toBe(false);
  });

  it('Test 8: Un perfil conservador respeta el tope de crecimiento de 20%', () => {
    const cartera = construirCarteraMeta(meta, supuestos, catalogo, acuerdos, 'conservador', '2026-09-30');

    expect(cartera.maxCrecimientoPermitidoPct).toBe(20);
    expect(cartera.pesoCrecimientoCarteraPct).toBeLessThanOrEqual(20);
    expect(cartera.cumplePerfilCrecimiento).toBe(true);

    const crecimientoPublicado = cartera.asignaciones.reduce(
      (acc, a) => acc + (a.pesoCarteraPct * a.pesoCrecimiento),
      0
    );
    expect(crecimientoPublicado).toBeLessThanOrEqual(20.01);
  });

  it('Test 9: En deficit la cartera escala los tramos y reparte solo el capital disponible', () => {
    const metaConDeficit: MetaFinanciera = {
      ...meta,
      capital_asignado_clp: 50_000_000
    };
    const plan = calcularPlanMeta(metaConDeficit, supuestos, '2026-09-30');
    expect(plan.alcanza).toBe(false);

    const cartera = construirCarteraMeta(metaConDeficit, supuestos, catalogo, acuerdos, 'moderado', '2026-09-30');
    const totalAsignadoUf = cartera.asignaciones.reduce((acc, a) => acc + a.capitalAsignadoUf, 0);

    expect(totalAsignadoUf).toBeCloseTo(plan.capitalAsignadoUf, 1);
    expect(totalAsignadoUf).toBeLessThanOrEqual(plan.capitalAsignadoUf + 0.01);
  });

  it('Test 10: Depositos a plazo y efectivo son candidatos elegibles sin AGF con TAC 0%', () => {
    const candidatos = obtenerCandidatosTramo(
      ['caja', 'deposito_plazo'],
      5_000_000,
      catalogo,
      acuerdos,
      6,
      cartola.cliente,
      '2026-09-30',
      supuestos
    );

    const efectivo = candidatos.find((c) => c.producto.id === 'efectivo-clp');
    const deposito = candidatos.find((c) => c.producto.id === 'deposito-uf-90d');

    expect(efectivo).toBeDefined();
    expect(efectivo?.serie).toBe('Única');
    expect(efectivo?.tacPct).toBe(0);
    expect(deposito).toBeDefined();
    expect(deposito?.serie).toBe('Única');
    expect(deposito?.tacPct).toBe(0);
  });

  it('Test 11: El remanente por tope de crecimiento no usa categorías ajenas al tramo', () => {
    const cartera = construirCarteraMeta(meta, supuestos, catalogo, acuerdos, 'conservador', '2026-09-30');

    for (const asignacion of cartera.asignaciones) {
      const tramo = supuestos.tramos.find((t) => t.id === asignacion.tramoId);
      expect(tramo).toBeDefined();
      const categorias = tramo!.categorias_permitidas ?? tramo!.categorias ?? [];
      expect(categorias).toContain(asignacion.categoria);
    }

    // T4 solo permite balanceado y renta variable: el remanente no puede ir a deuda_corto_clp
    const t4 = cartera.asignaciones.filter((a) => a.tramoId === 'T4');
    expect(t4.every((a) => ['balanceado', 'rv_chile', 'rv_global'].includes(a.categoria))).toBe(true);
    expect(cartera.alertas.some((a) => a.includes('sin asignar'))).toBe(true);
  });

  it('Test 12: En déficit la simulación anual parte del capital asignado y refleja la brecha', () => {
    const metaConDeficit: MetaFinanciera = {
      ...meta,
      capital_asignado_clp: 50_000_000
    };
    const cartera = construirCarteraMeta(metaConDeficit, supuestos, catalogo, acuerdos, 'moderado', '2026-09-30');
    const proy = proyectarEscenariosMeta(metaConDeficit, supuestos, '2026-09-30', cartera);

    expect(proy.escenarios['base'].porcentajeCoberturaPct).toBeLessThan(100);
    expect(proy.escenarios['base'].fechaAgotamiento).not.toBeNull();
    expect(proy.escenarios['base'].saldoFinalUf).toBe(0);
  });
});
