import { describe, it, expect } from 'vitest';
import cartolaData from '../data/cartola.json';
import catalogoData from '../data/catalogo.json';
import acuerdosData from '../data/acuerdos.json';
import type { Cartola, Catalogo, Acuerdos } from '../src/types/domain';
import { calcularPropuestaFondos, buscarMejorAlternativaCategoria } from '../src/motor/propuestaFondos';

const cartola = cartolaData as unknown as Cartola;
const catalogo = catalogoData as unknown as Catalogo;
const acuerdos = acuerdosData as unknown as Acuerdos;

describe('Nivel 2 — Sustitución por Fondos Equivalentes y Límites (R07)', () => {
  it('Test 1: Identifica fondos más económicos dentro de la misma categoría bajo acuerdos vigentes', () => {
    const mejorRentaFija = buscarMejorAlternativaCategoria(
      'deuda_uf',
      50_000_000,
      cartola,
      catalogo,
      acuerdos
    );

    expect(mejorRentaFija).not.toBeNull();
    // Debe seleccionar una serie elegible de una AGF con acuerdo activo (R01 y R04)
    expect(['alfa', 'beta']).toContain(mejorRentaFija?.producto.administradora);
    expect(mejorRentaFija?.tacPct).toBeLessThan(1.5);
  });

  it('Test 2: La propuesta de sustitución genera ahorro positivo sin incrementar el riesgo de categoría', () => {
    const res = calcularPropuestaFondos(cartola, catalogo, acuerdos);

    expect(res.sustituciones.length).toBeGreaterThan(0);
    expect(res.ahorroTotalAnualClp).toBeGreaterThanOrEqual(1_650_000);
    expect(res.tacPropuestaPonderadaPct).toBeLessThan(res.tacActualPonderadaPct);
  });

  it('Test 3: Alertas de concentración ante violación de límites (máx 40% por fondo y 60% por AGF)', () => {
    // Cartola modificada concentrando el 80% del capital en un único producto
    const cartolaConcentrada: Cartola = {
      ...cartola,
      posiciones: [
        {
          producto: 'alfa-deuda-uf',
          serie: 'CLASI',
          cuotas: 184000,
          valor_cuota: 1000,
          monto_clp: 184_000_000 // 80% de 230M
        },
        {
          producto: 'beta-balanceado',
          serie: 'A',
          cuotas: 46000,
          valor_cuota: 1000,
          monto_clp: 46_000_000 // 20% de 230M
        }
      ]
    };

    const resConcentrada = calcularPropuestaFondos(cartolaConcentrada, catalogo, acuerdos);
    expect(resConcentrada.alertasConcentracion.length).toBeGreaterThan(0);

    const alertaFondo = resConcentrada.alertasConcentracion.find((a) => a.includes('fondo'));
    const alertaAgf = resConcentrada.alertasConcentracion.find((a) => a.includes('AGF'));

    expect(alertaFondo).toBeDefined();
    expect(alertaAgf).toBeDefined();
  });
});
