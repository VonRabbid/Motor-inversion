import { describe, it, expect } from 'vitest';
import { ejecutarNivel1 } from '../src/motor';
import type { Cartola, Catalogo, Acuerdos } from '../src/types/domain';
import cartolaJson from '../data/cartola.json';
import catalogoJson from '../data/catalogo.json';
import acuerdosJson from '../data/acuerdos.json';

describe('Nivel 1 — Diagnóstico y Optimización de Series (TDD Suite)', () => {
  const cartola = cartolaJson as unknown as Cartola;
  const catalogo = catalogoJson as unknown as Catalogo;
  const acuerdos = acuerdosJson as unknown as Acuerdos;

  it('Test 1: Total identificado debe ser 230.000.000 CLP y sin identificar 5.000.000 CLP (2,13%)', () => {
    const diagnostico = ejecutarNivel1(cartola, catalogo, acuerdos);

    expect(diagnostico.total_identificado_clp).toBe(230_000_000);
    expect(diagnostico.total_no_identificado_clp).toBe(5_000_000);
    expect(diagnostico.total_cartera_clp).toBe(235_000_000);
    expect(diagnostico.pct_no_identificado).toBeCloseTo(2.13, 2);
  });

  it('Test 2: Costo anual actual de 5.180.000 CLP y TAC ponderada actual de 2,2522%', () => {
    const diagnostico = ejecutarNivel1(cartola, catalogo, acuerdos);

    expect(diagnostico.costo_actual_anual_clp).toBe(5_180_000);
    expect(diagnostico.tac_actual_ponderada_pct).toBeCloseTo(2.2522, 4);
  });

  it('Test 3: Verificación de estados R04 de las series de ejemplo', () => {
    const diagnostico = ejecutarNivel1(cartola, catalogo, acuerdos);

    // 1. Alfa Deuda UF: CLASI=actual, B=eligible, F=conditional
    const posAlfaDeuda = diagnostico.posiciones.find(p => p.producto_id === 'alfa-deuda-uf');
    expect(posAlfaDeuda).toBeDefined();

    const serieClasiAlfa = posAlfaDeuda?.series_evaluadas.find(s => s.serie === 'CLASI');
    expect(serieClasiAlfa?.estado).toBe('actual');

    const serieBAlfa = posAlfaDeuda?.series_evaluadas.find(s => s.serie === 'B');
    expect(serieBAlfa?.estado).toBe('eligible');

    const serieFAlfa = posAlfaDeuda?.series_evaluadas.find(s => s.serie === 'F');
    expect(serieFAlfa?.estado).toBe('conditional');

    // 2. Alfa RV Global: A=blocked (por estar cerrada en catalogo)
    const posAlfaRv = diagnostico.posiciones.find(p => p.producto_id === 'alfa-rv-global');
    expect(posAlfaRv).toBeDefined();

    const serieAAlfaRv = posAlfaRv?.series_evaluadas.find(s => s.serie === 'A');
    expect(serieAAlfaRv?.estado).toBe('blocked');

    // 3. Beta Balanceado: M=eligible (requiere mandato y el distribuidor tiene mandato activo con Beta)
    const posBetaBal = diagnostico.posiciones.find(p => p.producto_id === 'beta-balanceado');
    expect(posBetaBal).toBeDefined();

    const serieMBetaBal = posBetaBal?.series_evaluadas.find(s => s.serie === 'M');
    expect(serieMBetaBal?.estado).toBe('eligible');

    // 4. Gamma RV Chile: B=out_of_scope (sin acuerdo de distribucion con AGF Gamma)
    const posGammaRv = diagnostico.posiciones.find(p => p.producto_id === 'gamma-rv-chile');
    expect(posGammaRv).toBeDefined();

    const serieBGamma = posGammaRv?.series_evaluadas.find(s => s.serie === 'B');
    expect(serieBGamma?.estado).toBe('out_of_scope');
  });

  it('Test 4: Ahorro elegible total de 1.650.000 CLP al año, nueva TAC de 1,5348% y ahorro condicional adicional de 615.000 CLP', () => {
    const diagnostico = ejecutarNivel1(cartola, catalogo, acuerdos);

    expect(diagnostico.ahorro_elegible_anual_clp).toBe(1_650_000);
    expect(diagnostico.tac_nueva_elegible_ponderada_pct).toBeCloseTo(1.5348, 4);
    expect(diagnostico.ahorro_condicional_adicional_clp).toBe(615_000);
  });
});
