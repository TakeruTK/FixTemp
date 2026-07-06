# Informe de validación — PulseGuard 0.5.0

Fecha: 20 de junio de 2026

- CPU real: 100 % de carga máxima en la prueba automatizada.
- CPU, RAM y disco: trabajo verificable, detención segura y limpieza temporal correctos.
- Sesiones: muestras por segundo, resumen térmico/eléctrico e integridad correctos.
- Overlay: persistencia de posición, opacidad, tamaño y métricas correcta.
- TypeScript, bundle web, sensores, inventario y PWA: correctos.
- Paquete portátil arrancado; API, sensores y configuración del overlay respondieron correctamente.
- La inspección visual automatizada no estuvo disponible en este entorno.
- Windows bloqueó el compresor de NSIS; no se entrega un instalador incompleto.

## Entregable

`PulseGuard-Portable-0.5.0.zip`

SHA-256: `96A09169B5F113AFC3EDB559DE14168D2305E1013399C66C194435B198B95F60`

El FPS queda en `—` hasta disponer de un proveedor real de presentación de cuadros. PulseGuard no lo estima a partir del uso de GPU.
