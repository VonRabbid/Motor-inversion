import { describe, it, expect } from 'vitest';
import cartolaData from '../data/cartola.json';
import catalogoData from '../data/catalogo.json';
import acuerdosData from '../data/acuerdos.json';
import supuestosData from '../data/supuestos.json';
import type { Cartola, Catalogo, Acuerdos, Supuestos } from '../src/types/domain';
import { calcularPropuestaFondos, buscarMejorAlternativaCategoria } from '../src/motor/propuestaFondos';

const cartola = cartolaData as unknown as Cartola;
const catalogo = catalogoData as unknown as Catalogo;
const acuerdos = acuerdosData as unknown as Acuerdos;
const supuestos = supuestosData as unknown as Supuestos;

describe('Nivel 2 — Sustitución por Fondos Equivalentes y Límites (R07)', () => {
  it('Test 1: Identifica fondos más económicos con igualdad estricta de categoría', () => {
    const mejorRentaFija = buscarMejorAlternativaCategoria(
      'deuda_uf_mediano',
      50_000_000,
      cartola,
      catalogo,
      acuerdos
    );

    expect(mejorRentaFija).not.toBeNull();
    // Delta Deuda Corp serie B (1.05%) es más barato que Alfa serie B (1.45%)
    expect(mejorRentaFija?.producto.id).toBe('delta-deuda-corp');
    expect(mejorRentaFija?.serieCodigo).toBe('B');
    expect(mejorRentaFija?.tacPct).toBe(1.05);
  });

  it('Test 2: La propuesta de sustitución genera ahorro positivo sin incrementar el riesgo de categoría y calcula retorno neto', () => {
    const res = calcularPropuestaFondos(cartola, catalogo, acuerdos, supuestos);
    expect(res.sustituciones.length).toBeGreaterThan(0);
    expect(res.ahorroTotalAnualClp).toBeGreaterThanOrEqual(1_650_000);
    expect(res.tacPropuestaPonderadaPct).toBeLessThan(res.tacActualPonderadaPct);
    expect(res.volatilidadActualPonderadaPct).toBeDefined();
    expect(res.volatilidadPropuestaPonderadaPct).toBeDefined();
    expect(res.volatilidadPropuestaPonderadaPct).toBeLessThanOrEqual(res.volatilidadActualPonderadaPct);
    expect(res.retornoRealNetoPropuestoPct).toBeGreaterThan(res.retornoRealNetoActualPct);
  });

  it('Test 3: Alertas de concentración ante violación de límites (máx 40% por fondo y 60% por AGF)', () => {
    const cartolaConcentrada: Cartola = {
      ...cartola,
      posiciones: [
        {
          producto: 'alfa-deuda-uf',
          serie: 'CLASI',
          cuotas: 184000,
          valor_cuota: 1000,
          monto_clp: 184_000_000
        },
        {
          producto: 'beta-balanceado',
          serie: 'A',
          cuotas: 46000,
          valor_cuota: 1000,
          monto_clp: 46_000_000
        }
      ]
    };

    const resConcentrada = calcularPropuestaFondos(cartolaConcentrada, catalogo, acuerdos);
    expect(resConcentrada.alertasConcentracion.length).toBeGreaterThan(0);
    expect(resConcentrada.alertasConcentracion.some((a) => a.includes('fondo'))).toBe(true);
    expect(resConcentrada.alertasConcentracion.some((a) => a.includes('AGF'))).toBe(true);
  });
});
