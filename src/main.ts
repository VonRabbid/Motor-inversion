import './style.css';
import type { Cartola, Catalogo, Acuerdos } from './types/domain';
import { ejecutarNivel1 } from './motor/index';
import { renderNivel1 } from './ui/renderNivel1';
import cartolaData from '../data/cartola.json';
import catalogoData from '../data/catalogo.json';
import acuerdosData from '../data/acuerdos.json';

const catalogo = catalogoData as unknown as Catalogo;
const acuerdos = acuerdosData as unknown as Acuerdos;
let cartolaActiva: Cartola = cartolaData as unknown as Cartola;

// Montaje de la barra superior y contenedor principal en el DOM
function montarAplicacion(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;

  app.innerHTML = `
    <header class="top-navbar no-print">
      <div class="navbar-inner">
        <div class="navbar-title">
          <h1>Motor de Propuestas de Inversión</h1>
          <span class="navbar-subtitle">Nivel 1 · Diagnóstico y cambio de serie</span>
        </div>
        <div class="controls-group">
          <button id="btn-reset" class="btn">Restaurar ejemplo</button>
          <div class="file-input-wrapper">
            <button class="btn">Subir cartola</button>
            <input type="file" id="input-cartola" accept=".json" />
          </div>
          <button id="btn-print" class="btn btn-dark">Imprimir PDF</button>
        </div>
      </div>
    </header>

    <main class="container">
      <section id="vista-contenido"></section>
    </main>
  `;

  // Asignacion de eventos de usuario
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

    // Lectura asincrona del archivo JSON cargado por el asesor
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

// Ejecuta el motor matematico y renderiza la vista correspondiente con metadatos de cartola
function actualizarVista(): void {
  const contenedor = document.querySelector<HTMLElement>('#vista-contenido');
  if (!contenedor) return;

  const diag = ejecutarNivel1(cartolaActiva, catalogo, acuerdos);
  renderNivel1(contenedor, diag, cartolaActiva);
}

// Inicializar la aplicacion al cargar el documento
montarAplicacion();
