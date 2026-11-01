import type { DiagnosticoCartola } from '../types/domain';

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

// Renderiza los paneles de diagnostico, propuesta R05 y clausula regulatoria R01
export function renderNivel1(container: HTMLElement, diag: DiagnosticoCartola): void {
  const html = `
    <!-- Metricas clave de diagnostico (R02) -->
    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total Identificado</div>
        <div class="kpi-value">${formatoCLP(diag.total_identificado_clp)}</div>
        <div class="kpi-detail">Patrimonio en catálogo analizado</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Sin Identificar</div>
        <div class="kpi-value">${formatoCLP(diag.total_no_identificado_clp)}</div>
        <div class="kpi-detail">${formatoPct(diag.pct_no_identificado)} del total de la cartera</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">TAC Actual Ponderada</div>
        <div class="kpi-value">${formatoPct(diag.tac_actual_ponderada_pct, 4)}</div>
        <div class="kpi-detail">Costo promedio ponderado anual</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Costo Anual Actual</div>
        <div class="kpi-value">${formatoCLP(diag.costo_actual_anual_clp)}</div>
        <div class="kpi-detail">Cobro anual acumulado en comisiones</div>
      </div>
    </section>

    <!-- Resumen de optimizacion por cambio de series (R05) -->
    <section class="proposal-highlight">
      <div class="highlight-metric">
        <span class="title">Ahorro Anual Elegible Directo</span>
        <span class="amount">${formatoCLP(diag.ahorro_elegible_anual_clp)}</span>
      </div>
      <div class="highlight-metric">
        <span class="title">Nueva TAC Ponderada Propuesta</span>
        <span class="amount">${formatoPct(diag.tac_nueva_elegible_ponderada_pct, 4)}</span>
      </div>
      <div class="highlight-metric">
        <span class="title">Ahorro Condicional Potencial</span>
        <span class="amount">${formatoCLP(diag.ahorro_condicional_adicional_clp)}</span>
      </div>
    </section>

    <!-- Alertas de consistencia en cartola -->
    ${diag.alertas.length > 0 ? `
      <div style="background-color: var(--warning-light); border-left: 4px solid var(--warning-color); padding: 12px; margin-bottom: 24px; border-radius: 4px; font-size: 0.875rem;">
        <strong>Alertas de validación:</strong>
        <ul style="margin-left: 20px; margin-top: 4px;">
          ${diag.alertas.map(a => `<li>${a}</li>`).join('')}
        </ul>
      </div>
    ` : ''}

    <!-- Tabla de optimizacion de series por posicion -->
    <h2 class="section-title">Propuesta de Optimización de Series (R04 y R05)</h2>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th class="text-right">Monto CLP</th>
            <th>Serie Actual</th>
            <th>Serie Sugerida</th>
            <th class="text-right">Reducción (bps)</th>
            <th class="text-right">Ahorro Anual CLP</th>
            <th>Condición Adicional</th>
          </tr>
        </thead>
        <tbody>
          ${diag.posiciones.map((pos) => {
            const elegible = pos.mejorElegible;
            const cond = pos.condicionalAdicional;
            return `
              <tr>
                <td><strong>${pos.nombreProducto}</strong></td>
                <td class="text-right">${formatoCLP(pos.monto)}</td>
                <td><span class="badge badge-blocked">${pos.serieActual ?? 'S/S'} (${formatoPct(pos.tacPct)})</span></td>
                <td>
                  ${elegible ? `<span class="badge badge-eligible">${elegible.serie} (${formatoPct(elegible.tacPct)})</span>` : '<em>Sin cambio</em>'}
                </td>
                <td class="text-right">${elegible ? `-${elegible.ahorroBps} bps` : '-'}</td>
                <td class="text-right"><strong>${elegible ? formatoCLP(elegible.ahorroClp) : '$0'}</strong></td>
                <td>
                  ${cond ? `<span class="badge badge-conditional" title="${cond.condicion}">${cond.serie} (+${formatoCLP(cond.ahorroClpAdicional)})</span>` : '-'}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Tabla de diagnostico de cartera actual -->
    <h2 class="section-title">Diagnóstico de Cartera Actual (R02)</h2>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Activo</th>
            <th class="text-right">Monto CLP</th>
            <th class="text-right">Participación %</th>
            <th class="text-right">TAC Actual</th>
            <th class="text-right">Costo Anual CLP</th>
          </tr>
        </thead>
        <tbody>
          ${diag.posiciones.map((pos) => `
            <tr>
              <td>${pos.nombreProducto}</td>
              <td class="text-right">${formatoCLP(pos.monto)}</td>
              <td class="text-right">${formatoPct(pos.pesoPct)}</td>
              <td class="text-right">${formatoPct(pos.tacPct)}</td>
              <td class="text-right">${formatoCLP(pos.costoAnualClp)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Declaracion legal obligatoria de universos R01 -->
    <footer class="legal-footer">
      <strong>Declaración de Universo de Distribución (R01):</strong>
      Esta propuesta considera productos de las administradoras con las que el distribuidor mantiene acuerdos de distribución vigentes. Puede haber en el mercado alternativas de menor costo fuera de ese universo.
    </footer>
  `;

  container.innerHTML = html;
}
