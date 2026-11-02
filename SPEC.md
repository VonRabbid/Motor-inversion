# Especificación Técnica — Motor de Propuestas de Inversión (`SPEC.md`)

Este documento consolida el alcance, las decisiones de diseño matemático-financiero y la discusión crítica de las reglas de negocio implementadas en los **Niveles 1 y 2 (Reglas R01 a R07)**.

---

## 1. Alcance del Proyecto

### 1.1. Alcance Implementado (Niveles 1 y 2)
El sistema cubre íntegramente los siguientes módulos y reglas normativas y comerciales:
- **Nivel 1 — Diagnóstico y Optimización de Series**:
  - **R01**: Verificación de vigencia y alcance de acuerdos de distribución por AGF y producto. Declaración legal del universo de distribución.
  - **R02**: Clasificación patrimonial (total identificado y no identificado), consistencia de cuotas y valor cuota, y cálculo de la TAC actual ponderada.
  - **R04**: Matriz de elegibilidad de series por precedencia estricta (Reglas 0 a 6: acuerdos activos, series abiertas, plan APV, mandato de administración, ticket mínimo individual vs. patrimonio agregado y condiciones normativas).
  - **R05**: Propuesta de cambio a la mejor serie elegible dentro del mismo fondo, cuantificando ahorro anual elegible y condicional.
- **Nivel 2 — Planificación de Metas Financieras y Fondos Equivalentes**:
  - **R03**: Proyección de escenarios de retorno real (Base, Adverso, Favorable) y simulación anual de evolución del saldo y costos acumulados con saldo medio.
  - **R06**: Calce temporal dinámico de desembolsos en intervalos semiabiertos `[desde_meses, hasta_meses)`, cálculo de Valor Presente (VP), construcción de cartera multi-fondo respetando límites de diversificación y validación del tope de crecimiento del perfil del cliente.
  - **R07**: Sustitución por fondos equivalentes de menor TAC en la misma categoría, respeto activo de límites dinámicos (40% fondo / 60% AGF) y balance de volatilidad y retorno real neto.

### 1.2. Alcance Excluido Deliberadamente (Nivel 3)
Las reglas correspondientes al **Nivel 3 (R08 a R13)** —tales como la generación de titulares ejecutivos automatizados (`headline`), transiciones graduales, perfiles de rebalanceo dinámico o desglose visible de comisiones de distribución— fueron dejadas fuera del alcance de forma deliberada. La decisión de ingeniería priorizó garantizar la exactitud matemática, la robustez ante casos de borde, el determinismo en funciones puras y una cobertura de pruebas unitarias exhaustiva sobre las reglas base de diagnóstico, optimización de comisiones y calce patrimonial de metas.

---

## 2. Decisiones de Diseño Explícitas (R01 a R07)

1. **Vigencia temporal de acuerdos comerciales (R01):**
   Un acuerdo de distribución se considera válido si y sólo si `a.estado === 'active'` y la fecha de corte de la cartola se sitúa dentro del rango de vigencia: `(!a.vigente_desde || a.vigente_desde <= fechaCorte) && (!a.vigente_hasta || a.vigente_hasta >= fechaCorte)`. Si la AGF no cuenta con acuerdo activo o la serie no está habilitada en el convenio, la serie se cataloga como `out_of_scope` (Regla 0).

2. **Declaración legal del universo (R01):**
   Tanto en la vista de series (Nivel 1) como en la de metas y fondos (Nivel 2), se incorpora textualmente la advertencia legal regulatoria:
   *«Esta propuesta considera productos de las administradoras con las que ${distribuidor} mantiene acuerdos de distribución vigentes. Puede haber en el mercado alternativas de menor costo fuera de ese universo.»*

3. **Consistencia de cuotas, tolerancia de redondeo y productos sin AGF (R01/R02):**
   En posiciones con cuotas y valor cuota informados, se verifica que `|cuotas * valor_cuota - monto_clp| <= 1 CLP`. Si la discrepancia supera 1 peso chileno, se emite una alerta explícita en la cartola. Los activos de tipo depósito a plazo (`time_deposit`) y efectivo (`cash`) ingresan con costo TAC 0%. En Nivel 2, estos productos se incorporan como candidatos elegibles de su categoría con serie `'Única'`, TAC `0%` y sin exigir un acuerdo de AGF. Su única restricción adicional de elegibilidad es `liquidez_dias <= plazoMeses * 30`; una vez asignados, quedan sujetos a los mismos límites de concentración por producto y emisor que el resto de la cartera. Los instrumentos no encontrados en catálogo, seguros con ahorro (`insurance_savings`) y productos clasificados como `other` se aíslan como **no identificados / fuera de TAC** para no contaminar la TAC ponderada ni el patrimonio elegible. La vista de diagnóstico renderiza una tarjeta por cada posición excluida, indicando su monto, su porcentaje individual sobre la cartola total y el resumen agregado no identificado.

4. **Intervalos semiabiertos y descuento de Valor Presente (R06):**
   Para evitar solapamientos e inconsistencias en los puntos de corte temporal (24, 60 y 96 meses), los tramos se evalúan dinámicamente como intervalos semiabiertos `[desde_meses, hasta_meses)`. Cada desembolso se descuenta a Valor Presente mediante descuento anual compuesto, utilizando como `r_real` el retorno real bruto promedio simple de las categorías autorizadas para dicho tramo en `supuestos.json`. Esta tasa se rotula explícitamente como **supuesto** en la interfaz y en la impresión PDF. Los escenarios adversos no truncan las tasas en cero: un retorno bruto ajustado negativo se descuenta con su signo real.

5. **Reparto multi-fondo y revalidación del ticket mínimo en cada fragmento (R04/R06 Paso 5):**
   Para metas de gran envergadura (como el ejemplo universitario de 1.750 UF), tramos individuales como T3 y T4 con superávit superan por sí solos el límite máximo de concentración por fondo (`max_por_fondo_pct = 40%`) o por administradora (`max_por_agf_pct = 60%`). El algoritmo divide el capital del tramo entre los fondos elegibles más económicos de sus categorías permitidas, asigna hasta la capacidad remanente del fondo o AGF y deriva el saldo al siguiente fondo elegible más barato. Cada fragmento se evalúa con su monto CLP efectivo: se revalidan todas las series del producto mediante `evaluarSerie(...)` y se selecciona la serie `'eligible'` de menor TAC para ese ticket real. Así, un remanente pequeño nunca conserva una serie cuyo `minimo_clp` no alcanza. Se itera por producto único dentro de cada tramo para evitar duplicados `producto + serie`.

6. **Tope estricto de crecimiento del perfil y regla de cercanía de pago (R06 Paso 6):**
   El peso de crecimiento de la cartera se pondera según `peso_crecimiento = Σ (peso_i * peso_crecimiento_i)` (con renta variable = 1.0, balanceados = 0.5 y renta fija/caja = 0). Si faltan menos de 24 meses para el primer desembolso de la meta, el límite máximo permitido del perfil se reduce automáticamente al 50% (`max_crecimiento_pct * 0.5`) para mitigar el riesgo de secuencia de retornos adversos. Durante la construcción de la cartera se mantiene un acumulador `crecimientoAcumuladoPct`: antes de asignar un candidato con `peso_crecimiento > 0` se calcula el peso máximo que respeta el tope y, si el cupo se agota, el remanente del tramo se deriva al fondo de renta fija elegible más barato (`peso_crecimiento === 0`) **dentro de las categorías permitidas del mismo tramo**, dejando constancia en `alertas`. Si el tramo no admite categorías de renta fija, el remanente queda explícitamente sin asignar y se informa en la alerta; nunca se viola la restricción de categorías ni se cierra una brecha agregando riesgo. Con perfiles restrictivos (`maxPermitido < 50`) o con reducción por cercanía de pago se priorizan candidatos de menor `peso_crecimiento` antes que los de menor TAC.

7. **Simulación anual de saldos y costos acumulados con saldo medio (R03):**
   Para cada escenario (Adverso -1.5 pp, Base 0 pp, Favorable +1.5 pp), se simula la trayectoria anual del saldo descontando los desembolsos efectivos y aplicando en cada período anual $t$ el retorno real neto supuesto. El saldo inicial de cada tramo se toma del capital efectivamente asignado por la cartera sugerida; si el plan está en déficit, no se simula el VP teórico completo como si estuviera financiado, sino el capital disponible. La tasa neta de cada tramo respeta estrictamente la fórmula de R03:
   $$\text{retorno\_real\_neto} = \text{retorno\_bruto\_ponderado} + \text{ajuste\_escenario} - \text{TAC}_{\text{tramo}}$$
   donde $\text{TAC}_{\text{tramo}}$ es la TAC ponderada por capital de los fondos asignados a ese tramo (o la TAC ponderada de la cartera si no hay asignaciones). No se aplica `Math.max(0, ...)`: los escenarios adversos pueden producir retornos netos negativos y reducir el saldo. Los costos acumulados se calculan según la fórmula exacta de R03:
   $$\text{saldo\_medio}(t) = \frac{\text{saldo}(t-1) + \text{saldo}(t)}{2}$$
   $$\text{costo\_acumulado\_uf} = \sum_{t=1}^{n} \text{saldo\_medio}(t) \times \frac{\text{TAC}_{\text{ponderada}}}{100}$$
   Determinando la cobertura efectiva de pagos (%), el saldo final en UF y la fecha exacta de agotamiento en caso de déficit.

8. **Límites dinámicos, reasignación por riesgo y medición lineal de riesgo en fondos equivalentes (R07):**
   Los límites de concentración se leen dinámicamente desde `supuestos.limites` (con fallbacks a 40% por fondo y 60% por AGF). No existe fallback hacia un candidato que viole esos límites: solo se elige un destino si `montoFondoFuturo <= maxFondoMontoClp` y `montoAgfFuturo <= maxAgfMontoClp`. La sustitución sigue el orden de R07: (i) otra serie del mismo fondo; (ii) un equivalente más barato de la misma categoría dentro de los acuerdos; y (iii) si la AGF no tiene acuerdo vigente o no hay candidato válido en la categoría, una reasignación a una categoría equivalente o de menor/igual volatilidad (`volCatCandidata <= volCatActual`) con acuerdo vigente y menor TAC. Esto permite reasignar, por ejemplo, una posición en una AGF sin acuerdo hacia un fondo de renta variable global con menor volatilidad y TAC. Si una posición con acuerdo ya está en su opción más barata o no puede moverse por límites de concentración, la interfaz la rotula como **"Mantener posición actual"** cuando `esMismoProducto && ahorroBps === 0`; una posición fuera del universo sin alternativa elegible se muestra como "Sin alternativa dentro de los acuerdos vigentes" y nunca como destino propuesto. El riesgo se mide mediante la suma ponderada simple de volatilidades supuestas por categoría sobre el total identificado, declarada explícitamente en la nota metodológica de la vista y del PDF.

9. **Escalamiento proporcional en déficit de capital (R06):**
   Si `plan.alcanza === false` (`plan.totalVpUf > capitalTotalUf`), el capital objetivo de cada tramo se escala por `capitalTotalUf / plan.totalVpUf` antes de construir la cartera. La suma de las asignaciones sugeridas reparte el 100% del `capitalAsignadoUf` disponible, sin inventar patrimonio ni mantener objetivos de tramo calculados sobre un capital inexistente. El remanente de redondeo se ajusta en el último tramo para que la suma coincida con el capital disponible.

10. **Declaraciones metodológicas obligatorias en pantalla y PDF (R06/R07):**
    La vista de Nivel 2 incluye una nota metodológica visible que declara: (i) el método de descuento VP anual compuesto con `r_real` igual al retorno real bruto promedio simple de las categorías permitidas por tramo según `supuestos.json` (rotulado como supuesto); (ii) la regla de cercanía de pago, que reduce a la mitad el tope de crecimiento si faltan menos de 24 meses para el primer desembolso; y (iii) que la volatilidad de cartera se mide como suma ponderada simple de las volatilidades supuestas por categoría sobre el total identificado.

---

## 3. Discusión Crítica de Reglas del Negocio

### 3.1. Regla R04 — Evaluación de Mínimos y Agregación de Patrimonio
La regla R04 valida el ticket mínimo de una serie frente al monto de la posición individual y, en caso de no alcanzarlo, salta a evaluar el `patrimonio_agregado_clp` que el distribuidor mantiene en la AGF.
- **Análisis crítico:** Esta formulación presenta una laguna comercial: ignora el patrimonio que el **propio cliente** mantiene en distintos fondos de la misma AGF.
- **Evidencia en datos:** En la cartola de ejemplo, el cliente `ACC-4471` posee 60.000.000 CLP en `alfa-deuda-uf` y 45.000.000 CLP en `alfa-rv-global`, acumulando **105.000.000 CLP en AGF Alfa**. Esto sería suficiente por sí solo para acceder a la serie institucional F de `alfa-deuda-uf` (mínimo de 100.000.000 CLP), independientemente del patrimonio del distribuidor. Se recomienda formalizar un escalón intermedio que sume primero el patrimonio del cliente por administradora.

### 3.2. Regla R07 — Suma Ponderada Simple de Volatilidades
La regla R07 computa la volatilidad de la cartera como la media ponderada lineal de las volatilidades de cada categoría:
$$\sigma_{\text{cartera}} = \sum_{i=1}^{m} w_i \sigma_i$$
- **Análisis crítico:** Esta aproximación asume implícitamente un coeficiente de correlación perfecta ($\rho_{ij} = 1$) entre todos los activos del portafolio.
- **Impacto financiero:** Al asumir $\rho = 1$, se ignora por completo el beneficio de diversificación entre clases de activos descorrelacionadas (como renta fija local en UF y renta variable global). Aunque es una solución válida y trazable para efectos de comparación pedagógica y auditoría simple, un motor de producción fiduciaria debe calcular el riesgo mediante la formulación matricial de Markowitz: $\sigma_p = \sqrt{\mathbf{w}^T \mathbf{\Sigma} \mathbf{w}}$.
