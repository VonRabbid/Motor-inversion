import { describe, it, expect } from 'vitest';
import metaData from '../data/meta.json';
import supuestosData from '../data/supuestos.json';
import type { MetaFinanciera, Supuestos } from '../src/types/domain';
import { calcularPlanMeta, calcularTiempo, asignarTramo, proyectarEscenariosMeta } from '../src/motor/metas';

const meta = metaData as unknown as MetaFinanciera;
const supuestos = supuestosData as unknown as Supuestos;

describe('Nivel 2 — Calce de Plazos y Valor Presente de Metas (R06)', () => {
  it('Test 1: Calce temporal asigna el 1er desembolso a T3 y los siguientes 7 desembolsos a T4', () => {
    const { meses: meses1 } = calcularTiempo('2026-09-30', '2031-03-01');
    expect(meses1).toBeGreaterThanOrEqual(36);
    expect(meses1).toBeLessThan(60);
    expect(asignarTramo(meses1, supuestos).id).toBe('T3');

    const res = calcularPlanMeta(meta, supuestos, '2026-09-30');
    expect(res.desembolsos[0].tramoId).toBe('T3');
    for (let i = 1; i < res.desembolsos.length; i++) {
      expect(res.desembolsos[i].tramoId).toBe('T4');
    }
  });

  it('Test 2: Total de desembolsos universitarios suma 2.200 UF (88.000.000 CLP)', () => {
    const res = calcularPlanMeta(meta, supuestos, '2026-09-30');
    expect(res.totalDesembolsosUf).toBe(2200);
    expect(res.totalDesembolsosClp).toBe(88_000_000);
    expect(res.capitalAsignadoUf).toBe(1750);
  });

  it('Test 3: Con tasa plana de 2,0% anual el VP ronda las 1.882 UF (déficit de capital)', () => {
    const res = calcularPlanMeta(meta, supuestos, '2026-09-30', 2.0);
    expect(res.totalVpUf).toBeGreaterThanOrEqual(1880);
    expect(res.totalVpUf).toBeLessThanOrEqual(1884);
    expect(res.alcanza).toBe(false);
    expect(res.estadoBalance).toBe('deficit');
  });

  it('Test 4: Con tasa plana de 3,5% anual el VP ronda las 1.680 UF (superávit de capital)', () => {
    const res = calcularPlanMeta(meta, supuestos, '2026-09-30', 3.5);
    expect(res.totalVpUf).toBeGreaterThanOrEqual(1678);
    expect(res.totalVpUf).toBeLessThanOrEqual(1682);
    expect(res.alcanza).toBe(true);
    expect(res.estadoBalance).toBe('superavit');
  });

  it('Test 5: Proyección en escenarios Base, Adverso (-1,5 pp) y Favorable (+1,5 pp)', () => {
    const proy = proyectarEscenariosMeta(meta, supuestos, '2026-09-30');

    expect(proy.escenarios['base']).toBeDefined();
    expect(proy.escenarios['adverso']).toBeDefined();
    expect(proy.escenarios['favorable']).toBeDefined();

    // Mayor rentabilidad reduce el valor presente necesario para fondear la meta
    expect(proy.escenarios['favorable'].totalVpUf).toBeLessThan(proy.escenarios['base'].totalVpUf);
    expect(proy.escenarios['base'].totalVpUf).toBeLessThan(proy.escenarios['adverso'].totalVpUf);

    // En escenario adverso la meta queda deficitaria frente a las 1.750 UF disponibles
    expect(proy.escenarios['adverso'].alcanza).toBe(false);
    expect(proy.escenarios['adverso'].estadoBalance).toBe('deficit');
  });
});
