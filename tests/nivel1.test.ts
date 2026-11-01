import { describe, it, expect } from 'vitest';
import { ejecutarNivel1 } from '../src/motor/index';
import { evaluarSerie } from '../src/motor/evaluadorSeries';
import cartolaData from '../data/cartola.json';
import catalogoData from '../data/catalogo.json';
import acuerdosData from '../data/acuerdos.json';
import type { Cartola, Catalogo, Acuerdos, ProductoCatalogo, SerieCatalogo, Cliente } from '../src/types/domain';

const cartola = cartolaData as unknown as Cartola;
const catalogo = catalogoData as unknown as Catalogo;
const acuerdos = acuerdosData as unknown as Acuerdos;

describe('Nivel 1 — Diagnóstico y Optimización de Series', () => {
  it('Test 1: Total identificado debe ser 230.000.000 CLP y sin identificar 5.000.000 CLP (2,13%)', () => {
    const diag = ejecutarNivel1(cartola, catalogo, acuerdos);
    expect(diag.total_identificado_clp).toBe(230_000_000);
    expect(diag.total_no_identificado_clp).toBe(5_000_000);
    expect(diag.total_cartera_clp).toBe(235_000_000);
    expect(diag.pct_no_identificado).toBeCloseTo(2.13, 2);
  });

  it('Test 2: Costo anual actual de 5.180.000 CLP y TAC ponderada actual de 2,2522%', () => {
    const diag = ejecutarNivel1(cartola, catalogo, acuerdos);
    expect(diag.costo_actual_anual_clp).toBe(5_180_000);
    expect(diag.tac_actual_ponderada_pct).toBeCloseTo(2.2522, 4);
  });

  it('Test 3: Verificación de estados R04 de las series de ejemplo', () => {
    const diag = ejecutarNivel1(cartola, catalogo, acuerdos);

    // Alfa Deuda UF
    const posAlfaDeuda = diag.posiciones.find((p) => p.idProducto === 'alfa-deuda-uf');
    expect(posAlfaDeuda).toBeDefined();
    const seriesAlfaDeuda = posAlfaDeuda!.seriesEvaluadas;
    expect(seriesAlfaDeuda.find((s) => s.codigo === 'CLASI')?.estado).toBe('actual');
    expect(seriesAlfaDeuda.find((s) => s.codigo === 'B')?.estado).toBe('eligible');
    expect(seriesAlfaDeuda.find((s) => s.codigo === 'F')?.estado).toBe('conditional');
    expect(seriesAlfaDeuda.find((s) => s.codigo === 'M')?.estado).toBe('conditional');
    expect(seriesAlfaDeuda.find((s) => s.codigo === 'APV')?.estado).toBe('blocked');

    // Alfa RV Global: A bloqueada por cerrada
    const posAlfaRv = diag.posiciones.find((p) => p.idProducto === 'alfa-rv-global');
    expect(posAlfaRv?.seriesEvaluadas.find((s) => s.codigo === 'A')?.estado).toBe('blocked');

    // Beta Balanceado: M elegible por mandato activo en Beta
    const posBetaBal = diag.posiciones.find((p) => p.idProducto === 'beta-balanceado');
    expect(posBetaBal?.seriesEvaluadas.find((s) => s.codigo === 'M')?.estado).toBe('eligible');

    // Gamma RV Chile: B fuera de alcance por falta de acuerdo con Gamma
    const posGamma = diag.posiciones.find((p) => p.idProducto === 'gamma-rv-chile');
    expect(posGamma?.seriesEvaluadas.find((s) => s.codigo === 'B')?.estado).toBe('out_of_scope');
  });

  it('Test 4: Ahorro elegible total de 1.650.000 CLP al año, nueva TAC de 1,5348% y ahorro condicional adicional de 615.000 CLP', () => {
    const diag = ejecutarNivel1(cartola, catalogo, acuerdos);
    expect(diag.ahorro_elegible_anual_clp).toBe(1_650_000);
    expect(diag.tac_nueva_elegible_ponderada_pct).toBeCloseTo(1.5348, 4);
    expect(diag.ahorro_condicional_adicional_clp).toBe(615_000);
  });

  it('Test 5: Casos límite de R04 para tickets mínimos y habilitación APV', () => {
    const prodAlfa = catalogo.productos.find((p) => p.id === 'alfa-deuda-uf') as ProductoCatalogo;
    const serieB = prodAlfa.series.find((s) => s.codigo === 'B') as SerieCatalogo;
    const serieApv = prodAlfa.series.find((s) => s.codigo === 'APV') as SerieCatalogo;

    // Caso frontera: ticket exactamente igual al mínimo de 5.000.000 CLP
    const clienteBase: Cliente = {
      referencia: 'ACC-TEST',
      perfil_riesgo: 'moderado',
      perfil_evaluado_el: '2026-01-01',
      plan_apv: false
    };
    const resMontoExacto = evaluarSerie(prodAlfa, serieB, 5_000_000, clienteBase, acuerdos, null);
    expect(resMontoExacto.estado).toBe('eligible');

    // Caso APV: cliente con plan_apv activo debe habilitar serie APV
    const clienteConApv: Cliente = { ...clienteBase, plan_apv: true };
    const resApvActivo = evaluarSerie(prodAlfa, serieApv, 10_000_000, clienteConApv, acuerdos, null);
    expect(resApvActivo.estado).toBe('eligible');
  });

  it('Test 6: Detección de inconsistencias entre cuotas y monto declarado (R02)', () => {
    const cartolaConError: Cartola = {
      ...cartola,
      posiciones: [
        {
          producto: 'alfa-deuda-uf',
          serie: 'CLASI',
          cuotas: 1000,
          valor_cuota: 1000,
          monto_clp: 1_500_000 // Discrepancia intencional: 1.000.000 vs 1.500.000
        }
      ]
    };
    const diag = ejecutarNivel1(cartolaConError, catalogo, acuerdos);
    expect(diag.alertas.length).toBeGreaterThan(0);
    expect(diag.alertas[0]).toContain('Discrepancia');
  });
});
