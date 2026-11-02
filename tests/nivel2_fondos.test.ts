import { describe, it, expect } from 'vitest';
import cartolaData from '../data/cartola.json';
import catalogoData from '../data/catalogo.json';
import acuerdosData from '../data/acuerdos.json';
import supuestosData from '../data/supuestos.json';
import type { Cartola, Catalogo, Acuerdos, Supuestos } from '../src/types/domain';
import {
  calcularPropuestaFondos,
  buscarMejorAlternativaCategoria,
  obtenerCandidatosCategoria
} from '../src/motor/propuestaFondos';

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

  it('Test 4: gamma-rv-chile se reasigna a una AGF con acuerdo sin subir la volatilidad ni violar límites', () => {
    const res = calcularPropuestaFondos(cartola, catalogo, acuerdos, supuestos);
    const gamma = res.sustituciones.find((s) => s.idProductoActual === 'gamma-rv-chile');

    expect(gamma).toBeDefined();
    expect(gamma?.idProductoSugerido).not.toBe('gamma-rv-chile');
    expect(gamma?.agfSugerida).not.toBe('gamma');
    expect(gamma?.idProductoSugerido).toBe('delta-rv-global-idx');
    expect(gamma?.serieSugerida).toBe('B');

    const acuerdoGamma = (acuerdos.acuerdos ?? []).find(
      (a) =>
        (a.emisor === gamma?.agfSugerida || a.agf === gamma?.agfSugerida) &&
        a.estado === 'active'
    );
    expect(acuerdoGamma).toBeDefined();

    expect(res.volatilidadPropuestaPonderadaPct).toBeLessThanOrEqual(res.volatilidadActualPonderadaPct);

    for (const fondo of Object.values(res.concentracionPorFondo)) {
      expect(fondo.participacionPct).toBeLessThanOrEqual(fondo.limiteMaxPct);
      expect(fondo.excedeLimite).toBe(false);
    }
    for (const agf of Object.values(res.concentracionPorAgf)) {
      expect(agf.participacionPct).toBeLessThanOrEqual(agf.limiteMaxPct);
      expect(agf.excedeLimite).toBe(false);
    }
  });

  it('Test 5: Todo destino sugerido pertenece a una AGF con acuerdo vigente o es producto sin AGF', () => {
    const res = calcularPropuestaFondos(cartola, catalogo, acuerdos, supuestos);

    for (const sustitucion of res.sustituciones) {
      if (!sustitucion.idProductoSugerido) continue;
      const producto = catalogo.productos.find((p) => p.id === sustitucion.idProductoSugerido);
      expect(producto).toBeDefined();
      if (producto!.tipo === 'time_deposit' || producto!.tipo === 'cash') continue;

      const agf = producto!.administradora ?? producto!.emisor;
      const acuerdo = (acuerdos.acuerdos ?? []).find(
        (a) =>
          (a.emisor === agf || a.agf === agf) &&
          a.estado === 'active' &&
          (!a.vigente_desde || a.vigente_desde <= cartola.corte) &&
          (!a.vigente_hasta || a.vigente_hasta >= cartola.corte)
      );
      expect(acuerdo).toBeDefined();
    }
  });

  it('Test 6: Efectivo y depósitos a plazo son candidatos sin AGF con TAC 0%', () => {
    const candidatosCaja = obtenerCandidatosCategoria('caja', 20_000_000, cartola, catalogo, acuerdos);
    const efectivo = candidatosCaja.find((c) => c.producto.id === 'efectivo-clp');
    expect(efectivo).toBeDefined();
    expect(efectivo?.serieCodigo).toBe('Única');
    expect(efectivo?.tacPct).toBe(0);

    const candidatosDeposito = obtenerCandidatosCategoria(
      'deposito_plazo',
      20_000_000,
      cartola,
      catalogo,
      acuerdos
    );
    const deposito = candidatosDeposito.find((c) => c.producto.id === 'deposito-uf-90d');
    expect(deposito).toBeDefined();
    expect(deposito?.serieCodigo).toBe('Única');
    expect(deposito?.tacPct).toBe(0);
  });
});
