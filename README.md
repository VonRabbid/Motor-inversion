# Motor de Propuestas de Inversión

Sistema de diagnóstico de carteras, optimización de costos de series y generación de propuestas de inversión patrimoniales basadas en metas financieras.

## Tecnologías Utilizadas

- **TypeScript** (v5+): Tipado estático estricto, modelado formal del dominio financiero y prevención de errores en tiempo de compilación.
- **Vite**: Servidor de desarrollo con Hot Module Replacement (HMR) y empaquetador eficiente para la aplicación web cliente.
- **Vitest**: Entorno de pruebas unitarias automatizadas de alto rendimiento, nativo para ESM y TypeScript.

## Arquitectura del Sistema

El proyecto sigue una arquitectura desacoplada y orientada a funciones puras:

- **`src/motor/`**: Motor determinista compuesto exclusivamente por funciones puras sin efectos secundarios (sin dependencias del DOM ni llamadas de red). Organizado en 5 etapas:
  1. `leer`: Carga, validación y normalización de cartolas y catálogos.
  2. `diagnosticar`: Detección de ineficiencias de costos, series subóptimas y alertas de perfil.
  3. `proponer`: Rebalanceo hacia metas financieras y asignación óptima por tramos.
  4. `verificar`: Validación de restricciones de diversificación, liquidez y límites regulatorios.
  5. `documentar`: Generación de reportes ejecutivos e indicadores de impacto.
- **`src/ui/`**: Interfaz de usuario web interactiva y responsiva, diseñada para ejecutarse como Single Page Application (SPA) estática compatible con GitHub Pages e impresión nativa a PDF.
- **`data/`**: Conjuntos de datos locales normalizados para ejecución de pruebas y validaciones de referencia (`catalogo.json`, `acuerdos.json`, `cartola.json`, `supuestos.json`, `meta.json`).
- **`public/data/`**: Datos públicos servidos directamente al cliente para la versión web.
- **`tests/`**: Suite de pruebas unitarias automatizadas con Vitest.

## Especificación Técnica

Consultar SPEC.md para conocer las decisiones de diseño detalladas y las reglas de negocio implementadas en el motor.
