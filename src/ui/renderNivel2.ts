import type { ResultadoNivel2 } from '../types/domain';

function formatoCLP(monto: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(monto);
}

function formatoUF(monto: number): string {
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(monto)} UF`;
}

function formatoPct(pct: number, decimales = 2): string {
  return `${pct.toFixed(decimales).replace('.', ',')}%`;
}

// Renderiza la vista ejecutiva de metas y fondos con tipografia directa y sin contenedores redundantes
export function renderNivel2(container: HTMLElement, data: ResultadoNivel2): void {
  const base = data.metas.resultadoBase;
  const esc = data.metas.escenarios;
  const fondos = data.fondos;

  const esSuperavit = base.estadoBalance === 'superavit';
  const colorBalance = esSuperavit ? 'var(--success-color)' : 'var(--danger-color)';

  const html = `
    <!-- Paneles superiores paralelos alineados al estilo general -->
    <div class="dashboard-top-grid">
      <!-- Panel 1: Diagnóstico de la Meta -->
      <div class="panel-card">
        <h2 class="panel-card-title">Diagnóstico de la Meta Universitaria</h2>
        <div class="metrics-2x2">
          <div class="metric-item">
            <div class="metric-label">Capital Asignado</div>
            <div class="metric-val">${formatoUF(base.capitalAsignadoUf)}</div>
            <div class="metric-sub">${formatoCLP(base.capitalAsignadoClp)} (Valor UF: ${formatoCLP(base.valorUfClp)})</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Compromisos Totales</div>
            <div class="metric-val">${formatoUF(base.totalDesembolsosUf)}</div>
            <div class="metric-sub">${formatoCLP(base.totalDesembolsosClp)} en ${base.desembolsos.length} desembolsos</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Valor Presente Requerido</div>
            <div class="metric-val">${formatoUF(base.totalVpUf)}</div>
            <div class="metric-sub">${formatoCLP(base.totalVpClp)} descontado por tramo</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">Balance de Cobertura</div>
            <div class="metric-val" style="color: ${colorBalance};">
              ${esSuperavit ? '+' : ''}${formatoUF(base.diferenciaUf)}
            </div>
            <div class="metric-sub">${esSuperavit ? 'Superávit estimado de capital' : 'Déficit patrimonial estimado'}</div>
          </div>
        </div>
      </div>

      <!-- Panel 2: Propuesta con Fondos Equivalentes (R07) sin caja verde envolvente -->
      <div class="panel-card">
        <h2 class="panel-card-title">Propuesta con Fondos Equivalentes</h2>
        <div style="margin-bottom: 20px;">
          <div style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 2px;">Ahorro anual estimado (R07)</div>
          <div style="font-size: 1.875rem; font-weight: 800; color: var(--success-color); line-height: 1.2;">
            ${formatoCLP(fondos.ahorroTotalAnualClp)} / año
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Optimización por menor TAC dentro de la misma categoría</div>
        </div>
        <div class="metrics-2x2">
          <div class="metric-item">
            <div class="metric-label">Nueva TAC Propuesta</div>
            <div class="metric-val" style="color: var(--success-color);">${formatoPct(fondos.tacPropuestaPonderadaPct, 4)}</div>
            <div class="metric-sub">Cartera sugerida optimizada</div>
          </div>
          <div class="metric-item">
            <div class="metric-label">TAC Actual de Referencia</div>
            <div class="metric-val">${formatoPct(fondos.tacActualPonderadaPct, 4)}</div>
            <div class="metric-sub">Ponderada sobre identificados</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sensibilidad en Escenarios sin pastillas contenedoras en los estados -->
    <h2 class="section-title">Sensibilidad de la Meta en Escenarios de Retorno Real</h2>
    <div class="scenarios-grid">
      ${Object.values(esc).map((item) => {
        const ok = item.alcanza;
        return `
          <div class="scenario-card ${ok ? 'ok' : 'danger'}">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
              <span style="font-weight: 700; color: var(--text-main); font-size: 0.9375rem;">Escenario ${item.nombre}</span>
              <span style="font-weight: 700; font-size: 0.875rem; color: ${ok ? 'var(--success-color)' : 'var(--danger-color)'};">
                ${ok ? 'Cubierto' : 'Déficit'}
              </span>
            </div>
            <div style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 6px;">
              Ajuste de tasa: <strong>${item.ajustePp >= 0 ? '+' : ''}${item.ajustePp} pp</strong>
            </div>
            <div style="font-size: 1.25rem; font-weight: 700; margin: 4px 0;">
              VP: ${formatoUF(item.totalVpUf)}
            </div>
            <div style="font-size: 0.8125rem; color: ${ok ? 'var(--success-color)' : 'var(--danger-color)'}; font-weight: 600;">
              Balance: ${item.diferenciaUf >= 0 ? '+' : ''}${formatoUF(item.diferenciaUf)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
              Equivalente: ${formatoCLP(item.totalVpClp)}
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Cronograma de Desembolsos R06 -->
    <h2 class="section-title">Cronograma y Calce Temporal de Desembolsos (R06)</h2>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th class="text-right">Monto UF</th>
            <th class="text-right">Monto CLP</th>
            <th class="text-right">Plazo</th>
            <th>Tramo Horizonte</th>
            <th class="text-right">Tasa Real</th>
            <th class="text-right">VP (UF)</th>
            <th class="text-right">VP (CLP)</th>
          </tr>
        </thead>
        <tbody>
          ${base.desembolsos.map((d) => `
            <tr>
              <td><strong>${d.fecha}</strong></td>
              <td class="text-right">${formatoUF(d.montoUf)}</td>
              <td class="text-right">${formatoCLP(d.montoClp)}</td>
              <td class="text-right">${d.mesesDesdeCorte} m</td>
              <td><span class="badge badge-eligible">${d.tramoId}: ${d.tramoNombre}</span></td>
              <td class="text-right">${formatoPct(d.retornoRealAplicadoPct)}</td>
              <td class="text-right"><strong>${formatoUF(d.valorPresenteUf)}</strong></td>
              <td class="text-right">${formatoCLP(d.valorPresenteClp)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Sustitución de Fondos R07 -->
    <h2 class="section-title">Sustitución de Fondos por Menor TAC en la Misma Categoría (R07)</h2>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Categoría</th>
            <th>Fondo Actual</th>
            <th class="text-right">TAC Act.</th>
            <th>Fondo Propuesto</th>
            <th>Serie</th>
            <th class="text-right">TAC Prop.</th>
            <th class="text-right">Reducción</th>
            <th class="text-right">Ahorro Anual</th>
          </tr>
        </thead>
        <tbody>
          ${fondos.sustituciones.map((s) => `
            <tr>
              <td><span class="badge badge-blocked">${s.categoria}</span></td>
              <td>${s.nombreProductoActual}</td>
              <td class="text-right">${formatoPct(s.tacActualPct)}</td>
              <td><strong>${s.nombreProductoSugerido}</strong></td>
              <td><span class="badge badge-eligible">${s.serieSugerida}</span></td>
              <td class="text-right">${formatoPct(s.tacSugeridaPct)}</td>
              <td class="text-right">${s.ahorroBps > 0 ? `-${s.ahorroBps} bps` : '-'}</td>
              <td class="text-right"><strong>${s.ahorroAnualClp > 0 ? formatoCLP(s.ahorroAnualClp) : '$0'}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Declaracion legal obligatoria R01 y R07 -->
    <footer class="legal-footer">
      <strong>Declaración de Universo y Límites de Inversión (R01 y R07):</strong>
      Las propuestas de fondos equivalentes respetan los acuerdos vigentes de distribución. Los horizontes de inversión se calzan según la regla de intervalos semiabiertos. Diversificación sujeta a límites máximos de 40% por fondo y 60% por administradora.
    </footer>
  `;

  container.innerHTML = html;
}
