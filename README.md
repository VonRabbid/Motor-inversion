# Motor de Propuestas de Inversión

Sistema de diagnóstico de carteras de inversión, optimización de comisiones por cambio de serie, sustitución por fondos equivalentes y planificación patrimonial basada en metas financieras.

---

## Módulos del Motor (`src/motor/`)

La capa de negocio está diseñada como un conjunto de funciones puras deterministas, desacopladas del DOM y de efectos secundarios de red:

1. **`diagnostico.ts`**: Clasificación del patrimonio en total identificado y no identificado, validación de consistencia entre cuotas, valor cuota y monto declarado (tolerancia ±1 CLP) y cómputo de la TAC actual ponderada según la regla **R02**. Excluye activos no catalogados, seguros con ahorro y otros instrumentos fuera de alcance.
2. **`evaluadorSeries.ts`**: Evaluación de elegibilidad de cada serie según la precedencia estricta de la regla **R04** (Reglas 0 a 6: convenios de distribución vigentes **R01**, series abiertas, plan APV, mandato de administración, ticket mínimo vs. patrimonio agregado y condiciones normativas).
3. **`propuestaSeries.ts`**: Identificación de la serie más económica elegible dentro del mismo instrumento y cuantificación de ahorros anuales elegibles y condicionales (**R05**).
4. **`propuestaFondos.ts`**: Sustitución de posiciones por alternativas de menor TAC en la misma categoría y reasignación a categorías de menor o igual volatilidad cuando la AGF actual no tiene acuerdo o no existe una alternativa válida dentro de los límites (**R07**). Lee dinámicamente los límites de diversificación (máx. 40% por fondo y 60% por AGF), exige acuerdos vigentes para los fondos propuestos, incorpora efectivo y depósitos a plazo sin acuerdo de AGF y calcula volatilidad ponderada y retorno real neto estimado (**R03**).
5. **`metas.ts`**: Calce temporal dinámico en intervalos semiabiertos `[desde_meses, hasta_meses)`, cálculo de Valor Presente (VP) con tasas reales por tramo (**R06**), construcción de cartera con reparto multi-fondo ante copamiento de límites y revalidación del ticket mínimo en cada fragmento (**R04**), control estricto del tope de crecimiento del perfil, escalamiento proporcional en déficit y simulación anual del saldo y costos acumulados con saldo medio anual y retorno neto de TAC (**R03**).
6. **`index.ts`**: Fachada orquestadora del motor financiero, exportando las funciones principales `ejecutarNivel1` y `ejecutarNivel2`.

---

## Justificación del Stack Tecnológico

- **TypeScript (v5+)**: Tipado estático estricto para garantizar la integridad de los contratos financieros entre catálogos, convenios, cartolas y metas, eliminando errores de tipo en tiempo de compilación.
- **Vite**: Servidor de desarrollo ultrarrápido con Hot Module Replacement (HMR) y empaquetador optimizado que genera un bundle estático autónomo para despliegue en GitHub Pages.
- **Vitest**: Entorno de pruebas unitarias nativo en TypeScript y ESM con ejecución concurrente y retroalimentación inmediata en milisegundos.
- **Cero dependencias de runtime**: La aplicación no depende de frameworks pesados ni librerías externas de interfaz o matemáticas, asegurando portabilidad, reproducibilidad determinista y ligereza absoluta (< 55 kB gzipped).

---

## Instalación y Ejecución

### 1. Clonar el repositorio e instalar dependencias
```bash
git clone https://github.com/VonRabbid/Motor-inversion.git
cd "Motor propuestas de inversión"
npm install
```

### 2. Ejecutar el servidor de desarrollo
Inicia el servidor local con recarga en caliente:
```bash
npm run dev
```

### 3. Ejecutar la suite de pruebas unitarias
Corre la suite completa de 24 pruebas automatizadas (Nivel 1, Metas y Fondos Equivalentes):
```bash
npm test
```
O en modo observación continua:
```bash
npm run test:watch
```

### 4. Compilar para producción
Genera el bundle optimizado en la carpeta `dist/`:
```bash
npm run build
```

---

## Especificación Técnica

Consultar [`SPEC.md`](./SPEC.md) para conocer las decisiones de diseño detalladas, las fórmulas matemáticas aplicadas y la discusión crítica de las reglas de negocio implementadas en el motor.
