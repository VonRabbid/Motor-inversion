# Especificación Técnica — Motor de Propuestas (`SPEC.md`)

## 1. Arquitectura y Modelado de Datos
El sistema se divide en dos capas desacopladas:
- **Motor (`src/motor/`):** Funciones puras deterministas organizadas en 5 etapas secuenciales: `leer`, `diagnosticar`, `proponer`, `verificar` y `documentar`.
- **Interfaz (`src/ui/`):** Aplicación web estática sin servidor ni base de datos, compatible con GitHub Pages e impresión nativa a PDF.

Todos los tipos de producto (`mutual_fund`, `investment_fund`, `time_deposit`, `cash`, `equity_etf`, `insurance_savings`, `other`) implementan una estructura normalizada común, aplicando reglas de costo diferenciadas según la regla R02 y R11.

## 2. Decisiones de Diseño Explícitas
- **Normalización de catálogo:** Si una serie omite campos booleanos en `catalogo.json`, se asume por defecto `abierta = true`, `solo_apv = false` y `requiere_mandato = false`.
- **Validación de montos (R02):** Se advierte discrepancia cuando `|cuotas * valor_cuota - monto_clp| > 1 CLP`, sólo en posiciones donde `cuotas` y `valor_cuota` no sean nulos.
- **Intervalos de tramos en metas (R06):** Los límites de meses se evalúan como semiabiertos `[desde_meses, hasta_meses)` para evitar solapamientos en los bordes (24, 60 y 96 meses). Para el cálculo de Valor Presente (VP) de cada tramo se utiliza el retorno real bruto promedio simple de las categorías permitidas en dicho tramo.
- **Reducción de tope de crecimiento por cercanía de pago (R06):** Si faltan menos de 24 meses para el primer desembolso, el tope máximo de crecimiento del perfil se reduce a la mitad (`max_crecimiento_pct * 0.5`).
- **Métrica de riesgo (R07):** El riesgo de la cartera actual y propuesta se calcula mediante la suma ponderada simple de las volatilidades de cada categoría (`supuestos.json`) sobre el total identificado.
- **Tolerancias del titular `headline()` (R08):** Se considera mejora en costo o riesgo cuando la reducción es mayor o igual a `0.01` puntos porcentuales (1 punto base).
- **Vigencia del perfil de riesgo (R09 - `PERFIL_VENCIDO`):** El umbral de vencimiento se fija en **365 días** entre `perfil_evaluado_el` y la fecha de `corte` de la cartola.
- **Visibilidad de la comisión de distribución (R10 - Decisión Abierta):** Se define el parámetro booleano `mostrarComisionDistribuidor` (por defecto `true`). Justificación: Aunque la comisión no interviene en la construcción de la propuesta, transparentarla al cliente mitiga el conflicto de interés inherente a la distribución de fondos y se alinea con estándares modernos de regulación financiera.

## 3. Discusión de Reglas del Negocio
1. **Regla R04 (Evaluación de mínimos y agregación):** La regla actual pasa de validar el ticket individual de la posición a validar el `patrimonio_agregado_clp` de todo el distribuidor en la AGF. En una iteración futura, proponemos un paso intermedio que sume el patrimonio total del propio cliente dentro de la misma AGF (por ejemplo, el cliente ACC-4471 suma 105.000.000 CLP en AGF Alfa entre sus dos fondos, lo que por sí solo superaría el mínimo de 100.000.000 CLP de la serie F de `alfa-deuda-uf` sin depender del pool global del distribuidor).
2. **Regla R07 (Suma ponderada simple de volatilidades):** Calcular la volatilidad de la cartera como suma lineal ponderada asume implícitamente una correlación perfecta ($\rho = 1$) entre activos, ignorando el beneficio de diversificación entre renta fija en UF y renta variable global. Se implementa según lo permitido por la regla por simplicidad y trazabilidad, pero una matriz de varianza-covarianza reflejaría mejor el riesgo real.
