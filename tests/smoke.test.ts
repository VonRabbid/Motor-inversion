import { describe, it, expect } from 'vitest';
import type { Catalogo, Cartola, AcuerdosDistribucion, MetaFinanciera, Supuestos } from '../src/types';
import catalogoJson from '../data/catalogo.json';
import cartolaJson from '../data/cartola.json';
import acuerdosJson from '../data/acuerdos.json';
import metaJson from '../data/meta.json';
import supuestosJson from '../data/supuestos.json';

describe('Carga de datos y verificación de tipos base', () => {
  it('debe cargar los 5 archivos JSON con las estructuras esperadas', () => {
    const catalogo = catalogoJson as Catalogo;
    const cartola = cartolaJson as Cartola;
    const acuerdos = acuerdosJson as AcuerdosDistribucion;
    const meta = metaJson as MetaFinanciera;
    const supuestos = supuestosJson as Supuestos;

    expect(catalogo.productos.length).toBeGreaterThan(0);
    expect(cartola.posiciones.length).toBeGreaterThan(0);
    expect(acuerdos.acuerdos.length).toBeGreaterThan(0);
    expect(meta.desembolsos.length).toBeGreaterThan(0);
    expect(Object.keys(supuestos.categorias).length).toBeGreaterThan(0);
  });
});
