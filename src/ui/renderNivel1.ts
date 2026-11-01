import type { Cartola, DiagnosticoCartola } from '../types/domain';

// Formateador de moneda en pesos chilenos
function formatoCLP(monto: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(monto);
}

// Formateador de porcentajes con decimales configurables
function formatoPct(pct: number, decimales = 2): string {
  return `${pct.toFixed(decimales).replace('.', ',')}%`;
}

// Capitaliza la primera letra de una palabra
function capitalizar(texto: string): string {
  if (!texto) return '';
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

// Verifica si la evaluacion de perfil de riesgo supero los 365 dias
function esPerfilVencido(corteStr?: string, evaluadoStr?: string): boolean {
  if (!corteStr || !evaluadoStr) return false;
  const dCorte = new Date(corteStr);
  const dEval = new Date(evaluadoStr);
  const diffMs = Math.abs(dCorte.getTime() - dEval.getTime());
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  return diffDias > 365;
}

// Traduce el estado de la serie a etiqueta en espanol y badge visual
function renderBadgeEstado(estado: string): string {
  switch (estado) {
    case 'actual':
      return '<span class="badge-state badge-state-actual">Actual</span>';
    case 'eligible':
      return '<span class="badge-state badge-state-eligible">Elegible</span>';
    case 'conditional':
      return '<span class="badge-state badge-state-conditional">Condicional</span>';
    case 'blocked':
      return '<span class="badge-state badge-state-blocked">Bloqueada</span>';
    case 'out_of_scope':
      return '<span class="badge-state badge-state-out">Sin acuerdo</span>';
    default:
      return `<span class="badge-state badge-state-actual">${estado}</span>`;
  }
}

// Formatea la regla evaluada o indica 'Base' si es la serie actual de partida
function formatoRegla(regla: number, estado: string): string {
  if (regla === -1 || estado === 'actual') {
    return 'Base';
  }
  return `Regla ${regla}`;
}

// Renderiza la vista ejecutiva de diagnostico y propuesta de cambio de serie
export function renderNivel1(container: HTMLElement, diag: DiagnosticoCartola, cartola?: Cartola): void {
  const cliente = cartola?.cliente;
  const perfilVencido = cliente ? esPerfilVencido(cartola?.corte, cliente.perfil_evaluado_el) : false;

  const html = `
    <!-- Barra de informacion del cliente y vigencia de perfil -->
    ${cliente ? `
      <section class="client-bar">
        <div>Cliente: <strong>${cliente.referencia}</strong></div>
        <div>Fecha de corte: <strong>${cartola?.corte}</strong></div>
        <div>
          Perfil: <strong>${capitalizar(cliente.perfil_riesgo)}</strong> (evaluado el ${cliente.perfil_evaluado_el})
          ${perfilVencido ? '<span class="badge-amber">Perfil vencido</span>' : ''}
        </div>
        <div>Plan APV: <strong>${cliente.plan_apv ? 'Sí' : 'No'}</strong></div>
      </section>
    ` : ''}

    <!-- Grilla de resumen: diagnostico y propuesta por cambio de serie -->
    <section class="summary-grid">
      <div class="summary-card">
        <h2 class="summary-card-title">Diagnóstico de la cartola</h2>
        <div class="metrics-2x2">
          <div class="metric-item">
            <div class="metric-label">Total identificado</div>
            <div class="metric-val">${formatoCLP(diag.total_identificado_clp)} CLP</div>
            <div class="metric-sub">${diag.posiciones.length} posiciones en catálogo</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Sin identificar</div>
            <div class="metric-val">${formatoCLP(diag.total_no_identificado_clp)} CLP</div>
            <div class="metric-sub">${formatoPct(diag.pct_no_identificado)} de ${formatoCLP(diag.total_cartera_clp)} CLP</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">TAC actual ponderada</div>
            <div class="metric-val">${formatoPct(diag.tac_actual_ponderada_pct, 4)}</div>
            <div class="metric-sub">Sobre el total identificado</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Costo anual actual</div>
            <div class="metric-val">${formatoCLP(diag.costo_actual_anual_clp)} CLP</div>
            <div class="metric-sub">Suma de monto por TAC</div>
          </div>
        </div>
      </div>

      <div class="summary-card proposal-card">
        <h2 class="summary-card-title">Propuesta por cambio de serie</h2>
        <div class="proposal-top">
          <div class="proposal-label">Ahorro elegible anual</div>
          <div class="proposal-val-large">${formatoCLP(diag.ahorro_elegible_anual_clp)} CLP / año</div>
          <div class="proposal-sub-green">Reducción directa de comisión sin cambiar de fondo</div>
        </div>
        <div class="proposal-bottom-2col">
          <div class="metric-item">
            <div class="proposal-label">Nueva TAC ponderada</div>
            <div class="metric-val text-green">${formatoPct(diag.tac_nueva_elegible_ponderada_pct, 4)}</div>
            <div class="metric-sub">Baja desde ${formatoPct(diag.tac_actual_ponderada_pct, 4)} (Nuevo costo:<br>${formatoCLP(diag.costo_actual_anual_clp - diag.ahorro_elegible_anual_clp)} CLP / año)</div>
          </div>
          <div class="metric-item">
            <div class="proposal-label">Ahorro condicional adicional</div>
            <div class="metric-val text-amber">+${formatoCLP(diag.ahorro_condicional_adicional_clp)} CLP / año</div>
            <div class="metric-sub">Sujeto a condiciones comerciales</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Alertas de consistencia en cartola -->
    ${diag.alertas.length > 0 ? `
      <div class="alert-box-amber">
        <strong>Alertas de validación:</strong>
        <ul>
          ${diag.alertas.map(a => `<li>${a}</li>`).join('')}
        </ul>
      </div>
    ` : ''}

    <!-- Tabla unificada de posiciones y propuesta de series -->
    <section class="table-card">
      <div class="table-card-header">
        <h2>Posiciones de la cartola y cambio de serie</h2>
        <button id="btn-toggle-all-series" class="link-btn no-print">Mostrar todas las series evaluadas</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Posición</th>
              <th class="text-right">Monto CLP</th>
              <th class="text-right">Peso %</th>
              <th>Serie actual</th>
              <th>Mejor serie elegible</th>
              <th>Ahorro elegible</th>
              <th>Condicional adicional</th>
              <th>Series</th>
            </tr>
          </thead>
          <tbody>
            ${diag.posiciones.map((pos) => {
              const elegible = pos.mejorElegible;
              const cond = pos.condicionalAdicional;
              const tieneOutOfScope = pos.seriesEvaluadas.some(s => s.estado === 'out_of_scope');

              // Mejor serie elegible
              let mejorSerieHtml = '<span class="text-muted">Sin cambio</span>';
              if (elegible) {
                mejorSerieHtml = `<span class="badge-green">${elegible.serie} · ${formatoPct(elegible.tacPct)}</span>`;
              } else if (pos.seriesEvaluadas.length === 0) {
                mejorSerieHtml = '<span class="text-muted">Costo 0</span>';
              } else if (tieneOutOfScope) {
                mejorSerieHtml = '<span class="text-muted">Sin acuerdo con AGF</span>';
              }

              // Ahorro elegible
              let ahorroHtml = '—';
              if (elegible) {
                ahorroHtml = `<strong class="text-green nowrap">${formatoCLP(elegible.ahorroClp)} / año</strong><div class="sub-cell text-green nowrap">-${elegible.ahorroBps} bps</div>`;
              }

              // Condicional adicional
              let condHtml = '—';
              if (cond) {
                let condicionCorta = cond.condicion;
                if (cond.condicion.toLowerCase().includes('patrimonio agregado')) {
                  condicionCorta = 'Por patrimonio agregado';
                } else if (cond.condicion.toLowerCase().includes('mandato')) {
                  condicionCorta = 'Requiere mandato';
                }
                condHtml = `<strong class="text-amber">${cond.serie} (${formatoPct(cond.tacPct)}): +${formatoCLP(cond.ahorroClpAdicional)}</strong><div class="sub-cell text-muted">${condicionCorta}</div>`;
              } else if (tieneOutOfScope) {
                condHtml = '<span class="text-muted">Cambiar de AGF, no de serie</span>';
              }

              // Serie actual
              let serieActualHtml = '';
              if (pos.serieActual !== null) {
                serieActualHtml = `<div class="nowrap">${pos.serieActual} · ${formatoPct(pos.tacPct)}</div><div class="sub-cell text-muted nowrap">${formatoCLP(pos.costoAnualClp)} / año</div>`;
              } else {
                serieActualHtml = `<div class="nowrap">Sin serie · 0,00%</div><div class="sub-cell text-muted nowrap">$0 / año</div>`;
              }

              // Boton desplegable de series con cantidad
              const numSeries = pos.seriesEvaluadas.length;
              const seriesBtnHtml = numSeries > 0
                ? `<button class="btn-series-toggle no-print" data-target="series-${pos.idProducto}" data-count="${numSeries}">Ver series (${numSeries}) ▾</button>`
                : '—';

              return `
                <tr>
                  <td>
                    <strong>${pos.nombreProducto}</strong>
                    <div class="sub-cell text-muted">${pos.idProducto}</div>
                  </td>
                  <td class="text-right nowrap">${formatoCLP(pos.monto)}</td>
                  <td class="text-right nowrap">${formatoPct(pos.pesoPct)}</td>
                  <td>${serieActualHtml}</td>
                  <td>${mejorSerieHtml}</td>
                  <td>${ahorroHtml}</td>
                  <td>${condHtml}</td>
                  <td>${seriesBtnHtml}</td>
                </tr>
                ${numSeries > 0 ? `
                  <tr id="series-${pos.idProducto}" class="series-detail-row hidden">
                    <td colspan="8">
                      <div class="series-detail-container">
                        <div class="series-detail-title">Detalle de evaluación de series: ${pos.nombreProducto}</div>
                        <table class="series-subtable">
                          <thead>
                            <tr>
                              <th>Serie</th>
                              <th>TAC %</th>
                              <th>Estado</th>
                              <th>Regla</th>
                              <th>Motivo</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${pos.seriesEvaluadas.map(s => `
                              <tr>
                                <td class="nowrap">
                                  <strong>Serie ${s.codigo}</strong>
                                  ${s.estado === 'actual' ? '<span class="tag-actual">ACTUAL</span>' : ''}
                                </td>
                                <td class="nowrap">${formatoPct(s.tac_pct)}</td>
                                <td>${renderBadgeEstado(s.estado)}</td>
                                <td class="nowrap">${formatoRegla(s.regla, s.estado)}</td>
                                <td>${s.motivo}</td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                ` : ''}
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td class="nowrap">Total identificado</td>
              <td class="text-right nowrap">${formatoCLP(diag.total_identificado_clp)}</td>
              <td class="text-right nowrap">100,00%</td>
              <td class="nowrap">
                <strong>${formatoPct(diag.tac_actual_ponderada_pct, 4)}</strong>
                <div class="sub-cell">${formatoCLP(diag.costo_actual_anual_clp)} / año</div>
              </td>
              <td class="nowrap">
                <strong class="text-green">${formatoPct(diag.tac_nueva_elegible_ponderada_pct, 4)}</strong>
                <div class="sub-cell">${formatoCLP(diag.costo_actual_anual_clp - diag.ahorro_elegible_anual_clp)} / año</div>
              </td>
              <td class="nowrap"><strong class="text-green nowrap">${formatoCLP(diag.ahorro_elegible_anual_clp)} / año</strong></td>
              <td class="nowrap"><strong class="text-amber nowrap">+${formatoCLP(diag.ahorro_condicional_adicional_clp)} / año</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <!-- Tarjetas de posiciones no identificadas en catalogo -->
    ${cartola?.posiciones?.filter(p => p.producto === null).map(pos => `
      <div class="unidentified-card">
        • <strong>Posición sin identificar en catálogo:</strong> "${pos.descripcion_original ?? 'Sin descripción'}" — ${formatoCLP(pos.monto_clp)} CLP (${formatoPct(diag.pct_no_identificado)} de la cartola total). No se incluye en el cálculo de la TAC ponderada.
      </div>
    `).join('') ?? ''}

    <!-- Nota plana sobre el universo de distribucion -->
    <p class="note-universe">
      <strong>Nota sobre el universo usado:</strong> Se lee toda la cartola, pero solo se proponen series de administradoras con acuerdo de distribución vigente. El cálculo prepara la evidencia; la persona revisa y decide.
    </p>
  `;

  container.innerHTML = html;

  // Manejo de eventos para desplegar u ocultar series por producto
  const botonesSeries = container.querySelectorAll<HTMLButtonElement>('.btn-series-toggle');
  botonesSeries.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const count = btn.getAttribute('data-count') || '';
      if (!targetId) return;
      const fila = container.querySelector<HTMLTableRowElement>(`#${targetId}`);
      if (!fila) return;

      const estaOculto = fila.classList.contains('hidden');
      if (estaOculto) {
        fila.classList.remove('hidden');
        btn.textContent = `Ocultar series (${count}) ▴`;
      } else {
        fila.classList.add('hidden');
        btn.textContent = `Ver series (${count}) ▾`;
      }
    });
  });

  // Manejo de evento maestro para desplegar u ocultar todas las series
  const btnToggleAll = container.querySelector<HTMLButtonElement>('#btn-toggle-all-series');
  btnToggleAll?.addEventListener('click', () => {
    const filasDetalle = container.querySelectorAll<HTMLTableRowElement>('.series-detail-row');
    const hayOcultos = Array.from(filasDetalle).some(f => f.classList.contains('hidden'));

    filasDetalle.forEach((fila) => {
      if (hayOcultos) {
        fila.classList.remove('hidden');
      } else {
        fila.classList.add('hidden');
      }
    });

    botonesSeries.forEach((btn) => {
      const count = btn.getAttribute('data-count') || '';
      if (hayOcultos) {
        btn.textContent = `Ocultar series (${count}) ▴`;
      } else {
        btn.textContent = `Ver series (${count}) ▾`;
      }
    });

    if (btnToggleAll) {
      btnToggleAll.textContent = hayOcultos
        ? 'Ocultar todas las series evaluadas'
        : 'Mostrar todas las series evaluadas';
    }
  });
}
