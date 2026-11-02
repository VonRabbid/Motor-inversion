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

3. **Consistencia de cuotas y tolerancia de redondeo (R02):**
   En posiciones con cuotas y valor cuota informados, se verifica que `|cuotas * valor_cuota - monto_clp| <= 1 CLP`. Si la discrepancia supera 1 peso chileno, se emite una alerta explícita en la cartola. Los activos de tipo depósito a plazo (`time_deposit`) y efectivo (`cash`) ingresan con costo TAC 0%. Los instrumentos no encontrados en catálogo, seguros con ahorro (`insurance_savings`) y productos clasificados como `other` se aíslan como **no identificados / fuera de TAC** para no contaminar la TAC ponderada ni el patrimonio elegible.

4. **Intervalos semiabiertos en tramos de metas (R06):**
   Para evitar solapamientos e inconsistencias en los puntos de corte temporal (24, 60 y 96 meses), los tramos se evalúan dinámicamente como intervalos semiabiertos `[desde_meses, hasta_meses)`. Cada desembolso se descuenta a Valor Presente utilizando el retorno real bruto promedio simple de las categorías autorizadas para dicho tramo en `supuestos.json`.

5. **Reparto multi-fondo ante copamiento de límites en cartera de la meta (R06 Paso 5):**
   Para metas de gran envergadura (como el ejemplo universitario de 1.750 UF), tramos individuales como T3 (722,83 UF, 41,30%) y T4 con superávit (823,82 UF, 47,08%) superan por sí solos el límite máximo de concentración por fondo (`max_por_fondo_pct = 40%`, 700 UF) o por administradora (`max_por_agf_pct = 60%`, 1.050 UF). El algoritmo divide el capital del tramo entre los fondos elegibles más económicos de sus categorías permitidas: asigna hasta la capacidad remanente del fondo o AGF y deriva el saldo al siguiente fondo elegible más barato (ej. T3 completado con Alfa Deuda UF serie B y T4 combinado entre Delta RV Global Indexada y Beta Balanceado serie M).

6. **Tope de crecimiento del perfil y regla de cercanía de pago (R06 Paso 6):**
   El peso de crecimiento de la cartera se pondera según `peso_crecimiento = Σ (peso_i * peso_crecimiento_i)` (con renta variable = 1.0, balanceados = 0.5 y renta fija/caja = 0). Si faltan menos de 24 meses para el primer desembolso de la meta, el límite máximo permitido del perfil se reduce automáticamente al 50% (`max_crecimiento_pct * 0.5`) para mitigar el riesgo de secuencia de retornos adversos.

7. **Simulación anual de saldos y costos acumulados con saldo medio (R03):**
   Para cada escenario (Adverso -1.5 pp, Base 0 pp, Favorable +1.5 pp), se simula la trayectoria anual del saldo descontando los desembolsos efectivos y aplicando en cada período anual $t$ el retorno real neto supuesto. Los costos acumulados se calculan según la fórmula exacta de R03:
   $$\text{saldo\_medio}(t) = \frac{\text{saldo}(t-1) + \text{saldo}(t)}{2}$$
   $$\text{costo\_acumulado\_uf} = \sum_{t=1}^{n} \text{saldo\_medio}(t) \times \frac{\text{TAC}_{\text{ponderada}}}{100}$$
   Determinando la cobertura efectiva de pagos (%), el saldo final en UF y la fecha exacta de agotamiento en caso de déficit.

8. **Límites dinámicos y medición lineal de riesgo en fondos equivalentes (R07):**
   Los límites de concentración se leen dinámicamente desde `supuestos.limites` (con fallbacks a 40% por fondo y 60% por AGF). La sustitución por menor TAC dentro de la misma categoría preserva o reduce el riesgo de la cartera, medido mediante la suma ponderada simple de volatilidades sobre el patrimonio identificado.

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
