import './style.css';
import type { Cartola, Catalogo, Acuerdos, MetaFinanciera, Supuestos, Cliente } from './types/domain';
import { ejecutarNivel1, ejecutarNivel2 } from './motor/index';
import { renderNivel1 } from './ui/renderNivel1';
import { renderNivel2 } from './ui/renderNivel2';
import cartolaData from '../data/cartola.json';
import catalogoData from '../data/catalogo.json';
import acuerdosData from '../data/acuerdos.json';
import metaData from '../data/meta.json';
import supuestosData from '../data/supuestos.json';

const catalogo = catalogoData as unknown as Catalogo;
const acuerdos = acuerdosData as unknown as Acuerdos;
const meta = metaData as unknown as MetaFinanciera;
const supuestos = supuestosData as unknown as Supuestos;

let cartolaActiva: Cartola = cartolaData as unknown as Cartola;
let pestañaActiva: 'series' | 'metas' = 'series';

// Parser simple de cartolas en formato CSV
function parsearCartolaCsv(textoCsv: string, clienteActual: Cliente, fechaCorte: string): Cartola {
  const lineas = textoCsv.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2) throw new Error('El archivo CSV carece de filas de datos.');

  const encabezados = lineas[0].split(',').map((h) => h.trim().toLowerCase());
  const posiciones = [];

  for (let i = 1; i < lineas.length; i++) {
    const cols = lineas[i].split(',').map((c) => c.trim());
    const fila: Record<string, string> = {};
    encabezados.forEach((h, idx) => { fila[h] = cols[idx] ?? ''; });

    const producto = fila['producto'] && fila['producto'] !== 'null' && fila['producto'] !== ''
      ? fila['producto']
      : null;
    const serie = fila['serie'] && fila['serie'] !== 'null' && fila['serie'] !== ''
      ? fila['serie']
      : null;
    const cuotas = fila['cuotas'] && fila['cuotas'] !== '' ? parseFloat(fila['cuotas']) : null;
    const valor_cuota = fila['valor_cuota'] && fila['valor_cuota'] !== '' ? parseFloat(fila['valor_cuota']) : null;
    const monto_clp = fila['monto_clp'] ? parseFloat(fila['monto_clp']) : 0;
    const descripcion_original = fila['descripcion_original'] || undefined;

    posiciones.push({
      producto,
      serie,
      cuotas: isNaN(cuotas as number) ? null : cuotas,
      valor_cuota: isNaN(valor_cuota as number) ? null : valor_cuota,
      monto_clp: isNaN(monto_clp) ? 0 : monto_clp,
      descripcion_original
    });
  }

  return {
    cliente: clienteActual,
    corte: fechaCorte,
    moneda: 'CLP',
    posiciones
  };
}

function montarAplicacion(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;

  app.innerHTML = `
    <main class="container">
      <header class="app-header">
        <div class="app-title">
          <h1>Motor de Propuestas de Inversión</h1>
          <p id="app-subtitulo">Diagnóstico de cartera actual y optimización de series</p>
        </div>
        <div class="controls-group no-print">
          <button id="btn-reset" class="btn" title="Restaurar datos de prueba">Restaurar Ejemplo</button>
          <div class="file-input-wrapper">
            <button class="btn">Subir Cartola (JSON / CSV)</button>
            <input type="file" id="input-cartola" accept=".json,.csv" />
          </div>
          <button id="btn-print" class="btn btn-primary">Imprimir / PDF</button>
        </div>
      </header>

      <nav class="tabs-container no-print">
        <button id="tab-series" class="tab-btn active">Optimización de series</button>
        <button id="tab-metas" class="tab-btn">Plan de metas y fondos</button>
      </nav>

      <section id="vista-contenido"></section>
    </main>
  `;

  const btnTabSeries = document.querySelector('#tab-series');
  const btnTabMetas = document.querySelector('#tab-metas');
  const subtitulo = document.querySelector('#app-subtitulo');

  btnTabSeries?.addEventListener('click', () => {
    pestañaActiva = 'series';
    btnTabSeries.classList.add('active');
    btnTabMetas?.classList.remove('active');
    if (subtitulo) subtitulo.textContent = 'Diagnóstico de cartera actual y optimización de series';
    actualizarVista();
  });

  btnTabMetas?.addEventListener('click', () => {
    pestañaActiva = 'metas';
    btnTabMetas.classList.add('active');
    btnTabSeries?.classList.remove('active');
    if (subtitulo) subtitulo.textContent = 'Calce de plazos para meta universitaria, escenarios y fondos equivalentes';
    actualizarVista();
  });

  document.querySelector('#btn-reset')?.addEventListener('click', () => {
    cartolaActiva = cartolaData as unknown as Cartola;
    actualizarVista();
  });

  document.querySelector('#btn-print')?.addEventListener('click', () => {
    window.print();
  });

  const inputCartola = document.querySelector<HTMLInputElement>('#input-cartola');
  inputCartola?.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const nombreArchivo = file.name.toLowerCase();
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const contenido = e.target?.result as string;
        let cartolaParseada: Cartola;

        if (nombreArchivo.endsWith('.csv')) {
          cartolaParseada = parsearCartolaCsv(contenido, cartolaActiva.cliente, cartolaActiva.corte);
        } else {
          cartolaParseada = JSON.parse(contenido) as Cartola;
        }

        if (!cartolaParseada.posiciones || !cartolaParseada.cliente) {
          alert('El archivo no cumple con la estructura requerida para la cartola.');
          return;
        }

        cartolaActiva = cartolaParseada;
        actualizarVista();
      } catch {
        alert('Error al procesar el archivo. Verifique el formato JSON o CSV.');
      }
    };
    reader.readAsText(file);
  });

  actualizarVista();
}

function actualizarVista(): void {
  const contenedor = document.querySelector<HTMLElement>('#vista-contenido');
  if (!contenedor) return;

  if (pestañaActiva === 'series') {
    const diag = ejecutarNivel1(cartolaActiva, catalogo, acuerdos);
    // Pasa cartolaActiva y el distribuidor segun declaracion de universo R01
    renderNivel1(contenedor, diag, cartolaActiva, acuerdos.distribuidor);
  } else {
    const resN2 = ejecutarNivel2(meta, supuestos, cartolaActiva, catalogo, acuerdos);
    renderNivel2(contenedor, resN2, acuerdos.distribuidor);
  }
}

montarAplicacion();
