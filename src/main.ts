import './style.css';

console.log('Motor de Propuestas de Inversión inicializado.');

const appElement = document.querySelector<HTMLDivElement>('#app');
if (appElement) {
  appElement.innerHTML = `
    <main class="container">
      <h1>Motor de Propuestas de Inversión</h1>
      <p>Capa de interfaz en preparación (src/ui/).</p>
    </main>
  `;
}
