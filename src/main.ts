import './style.css';
import type { Cartola, Catalogo, Acuerdos, MetaFinanciera, Supuestos } from './types/domain';
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

// Montaje principal de la interfaz sin etiquetas Nivel 1 / Nivel 2
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
            <button class="btn">Subir Cartola JSON</button>
            <input type="file" id="input-cartola" accept=".json" />
          </div>
          <button id="btn-print" class="btn btn-primary">Imprimir / PDF</button>
        </div>
      </header>

      <!-- Selector por pestañas con nombres directos -->
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
    cartolaActiva = cartolaData as Cartola;
    actualizarVista();
  });

  document.querySelector('#btn-print')?.addEventListener('click', () => {
    window.print();
  });

  const inputCartola = document.querySelector<HTMLInputElement>('#input-cartola');
  inputCartola?.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as Cartola;
        if (!json.posiciones || !json.cliente) {
          alert('El archivo no cumple con la estructura de una cartola válida.');
          return;
        }
        cartolaActiva = json;
        actualizarVista();
      } catch {
        alert('Error al procesar el archivo JSON. Verifique la sintaxis.');
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
    renderNivel1(contenedor, diag);
  } else {
    const resN2 = ejecutarNivel2(meta, supuestos, cartolaActiva, catalogo, acuerdos);
    renderNivel2(contenedor, resN2);
  }
}

montarAplicacion();
