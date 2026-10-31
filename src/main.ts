import './style.css';

// Punto de entrada de la aplicacion y montaje inicial en el DOM
console.log('Motor de Propuestas de Inversión inicializado.');

const appElement = document.querySelector<HTMLDivElement>('#app');
if (appElement) {
  // Contenedor principal donde se inyectara la interfaz
  appElement.innerHTML = `
    <main class="container">
      <h1>Motor de Propuestas de Inversión</h1>
      <p>Capa de interfaz en preparación (src/ui/).</p>
    </main>
  `;
}
