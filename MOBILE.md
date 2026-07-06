# PulseGuard en móviles y tablets

La interfaz web es una PWA instalable y ejecuta el diagnóstico rápido directamente en el dispositivo. Funciona en Android, iPadOS e iOS con las capacidades que cada navegador permite.

## Disponible en la PWA

- Núcleos lógicos, memoria aproximada cuando el navegador la expone, pantalla y GPU WebGL.
- Espacio de almacenamiento asignado al navegador.
- Nivel y estado de carga de batería cuando existe Battery Status API.
- Benchmark local breve de CPU, GPU y memoria.
- Prueba intensiva de 10 segundos usando todos los hilos visibles y WebGL.
- Historial local y comparación con la línea base del mismo dispositivo.

## Requiere aplicación nativa

- Temperatura interna de CPU/GPU/SoC.
- Watts reales del SoC.
- Capacidad de diseño, capacidad actual y ciclos de batería.
- Estado de NAND/almacenamiento, frecuencias y throttling térmico del sistema.

Android puede exponer parte de estos datos mediante APIs nativas y permisos del fabricante. iOS limita aún más el acceso; no se debe prometer una temperatura o una “cantidad de años restantes” que el sistema operativo no entregue.

La PWA constituye la base compartida. Para una versión comercial completa, el siguiente empaquetado será Android (Capacitor/Kotlin) y después iOS (Capacitor/Swift), manteniendo esta misma interfaz y sustituyendo la capa de sensores.
