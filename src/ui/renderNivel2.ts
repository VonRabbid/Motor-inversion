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

export function renderNivel2(container: HTMLElement, data: ResultadoNivel2 & { carteraMeta?: any }): void {
  const base = data.metas.resultadoBase;
  const esc = data.metas.escenarios;
  const fondos = data.fondos;
  const carteraMeta = data.carteraMeta;

  const esSuperavit = base.estadoBalance === 'superavit';
  const colorBalance = esSuperavit ? 'var(--success-color)' : 'var(--danger-color)';

  const html = `
    <!-- Paneles superiores paralelos -->
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

      <!-- Panel 2: Propuesta con Fondos Equivalentes (R07) -->
      <div class="panel-card">
        <h2 class="panel-card-title">Propuesta con Fondos Equivalentes (R07)</h2>
        <div style="margin-bottom: 20px;">
          <div style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 2px;">Ahorro anual estimado</div>
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

    <!-- Cartera construida para la meta financiera (R06 Pasos 3 a 6) -->
    ${carteraMeta ? `
      <section class="table-card">
        <div class="table-card-header">
          <h2>Asignación de Cartera Sugerida para la Meta (R06)</h2>
          <span style="font-size: 0.8125rem; color: ${carteraMeta.cumplePerfilCrecimiento ? 'var(--success-color)' : 'var(--danger-color)'}; font-weight: 600;">
            Crecimiento: ${formatoPct(carteraMeta.pesoCrecimientoCarteraPct)} (Máx. permitido: ${formatoPct(carteraMeta.maxCrecimientoPermitidoPct)})
          </span>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Tramo</th>
                <th>Fondo Seleccionado</th>
                <th>AGF</th>
                <th>Serie</th>
                <th class="text-right">TAC %</th>
                <th class="text-right">Asignación UF</th>
                <th class="text-right">Asignación CLP</th>
                <th class="text-right">Peso Cartera</th>
              </tr>
            </thead>
            <tbody>
              ${carteraMeta.asignaciones.map((a: any) => `
                <tr>
                  <td><strong>${a.tramoId}</strong> (${a.tramoNombre})</td>
                  <td>${a.nombreProducto}</td>
                  <td><span class="badge badge-gray">${a.agf.toUpperCase()}</span></td>
                  <td><span class="badge badge-eligible">${a.serie}</span></td>
                  <td class="text-right">${formatoPct(a.tacPct)}</td>
                  <td class="text-right"><strong>${formatoUF(a.capitalAsignadoUf)}</strong></td>
                  <td class="text-right">${formatoCLP(a.capitalAsignadoClp)}</td>
                  <td class="text-right">${formatoPct(a.pesoCarteraPct)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    ` : ''}

    <!-- Sensibilidad en Escenarios de Retorno Real -->
    <h2 class="section-title">Sensibilidad de la Meta en Escenarios de Retorno Real (R03 y R06)</h2>
    <div class="scenarios-grid">
      ${Object.values(esc).map((item: any) => {
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
              Ajuste supuesto: <strong>${item.ajustePp >= 0 ? '+' : ''}${item.ajustePp} pp</strong>
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
          ${base.desembolsos.map((d: any) => `
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
          ${fondos.sustituciones.map((s: any) => `
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

    <footer class="legal-footer">
      <strong>Declaración de Universo y Límites de Inversión (R01 y R07):</strong>
      Esta propuesta considera productos de las administradoras con las que el distribuidor mantiene acuerdos vigentes. Los horizontes se calzan en intervalos semiabiertos. Diversificación sujeta a límites de 40% por fondo y 60% por administradora. Todos los retornos futuros corresponden a supuestos declarados y no constituyen promesa de rentabilidad.
    </footer>
  `;

  container.innerHTML = html;
}
