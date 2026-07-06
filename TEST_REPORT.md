# Informe de validación — PulseGuard 0.4.1

Fecha: 20 de junio de 2026  
Equipo de prueba: Windows, Intel Core i5-9400F, NVIDIA GeForce RTX 3060

## Resultado

Todas las pruebas automatizadas finalizaron correctamente.

## Sensores directos — actualización 0.4.0

- Temperatura real comprobada en el equipo de validación: **55 °C**, fuente `CPU Package`.
- Frecuencia directa comprobada: **3905 MHz**, frente a los 2904 MHz fijos que entregaba la lectura anterior.
- Potencia directa comprobada: **46,8 W**, fuente `CPU Package`.
- Muestreo del lector privilegiado: 1 segundo.
- Compatibilidad implementada mediante LibreHardwareMonitor 0.9.6 + controlador PawnIO 2.1 firmado, con rutas Intel y AMD.
- Respaldo de frecuencia sin privilegios mediante el contador real `% Processor Performance` de Windows.
- Transición de telemetría verificada: 55,4 → 62,1 °C y 3800 → 3910 MHz.
- El estrés CPU queda bloqueado si la temperatura tiene más de 5 segundos o no existe.

| Área | Resultado |
|---|---:|
| Muestras de telemetría validadas | 8/8 |
| Latencia media de la API local | 107,5 ms |
| CPU informada / medición independiente | 100 % / 99,6 % |
| Diferencia de CPU bajo carga | 0,4 puntos porcentuales |
| RAM informada | 47 % |
| Potencia GPU informada por `nvidia-smi` | 46,7 W |
| Memoria del servicio Node en prueba | 54,7 MB |
| Detención manual de estrés | Correcta |
| Carga CPU máxima alcanzada | 100 % |
| Inicio y detención de estrés RAM | Correctos |
| Inicio y detención de estrés de disco | Correctos |
| Limpieza de archivos temporales | Correcta |
| PWA instalable y shell sin conexión | Correctos |

## Aplicación Windows empaquetada

- Arranque limpio comprobado sin servidor de desarrollo.
- API y sensores locales disponibles desde el paquete instalado.
- Antigüedad observada: CPU 0,65 s y GPU 2,11 s, dentro de sus frecuencias objetivo.
- Latencia media observada en el paquete: 28,2 ms.
- Memoria privada total de los cuatro procesos Electron: 253,8 MB.
- La suma de *working set* fue 973,3 MB, pero incluye páginas compartidas contadas en varios procesos; no equivale a memoria exclusivamente reservada.
- El muestreo se reduce automáticamente cuando la ventana no está activa para limitar CPU, accesos de disco y consultas de sensores.

## Exactitud y procedencia

- CPU, RAM, red, discos y procesos: sistema operativo.
- GPU NVIDIA, temperatura, reloj y vatios: `nvidia-smi` cuando está disponible.
- Potencia CPU: sólo se muestra cuando existe una lectura directa del sensor; no se calcula a partir de carga o TDP.
- Temperaturas o vatios no expuestos por el controlador se muestran como no disponibles; PulseGuard no inventa valores.
- La prueba de telemetría compara la CPU con una lectura independiente de los contadores de Windows.

## Móviles y tablets

La PWA es instalable desde un navegador moderno y permite inventario disponible, batería cuando el navegador la expone, cuota de almacenamiento, benchmark local, historial y estrés corto de CPU/GPU. El indicador de conservación necesita al menos tres pruebas y compara tendencias contra la línea base del propio dispositivo.

Un navegador móvil no expone de forma confiable temperatura interna, ciclos de batería, capacidad de diseño ni potencia eléctrica. Por ello esos valores no se simulan. Para obtenerlos hacen falta futuras aplicaciones nativas Android/iOS y validación en dispositivos físicos; esta entrega no incluye APK ni IPA.

## Ampliación de cobertura 0.4.0

- El lector privilegiado descubre GPU NVIDIA, AMD e Intel mediante LibreHardwareMonitor.
- NVIDIA mantiene `nvidia-smi` como proveedor prioritario y usa el lector directo como respaldo.
- Batería nativa de notebooks: porcentaje, alimentación, capacidad y ciclos cuando Windows los expone.
- Inventario de discos ampliado con interfaz, número de serie y estado S.M.A.R.T. disponible.
- La API declara capacidades por equipo para CPU, GPU, batería y almacenamiento.
- La interfaz muestra explícitamente sensores disponibles y no expuestos.
- Prueba AMD simulada superada y RTX 3060 real verificada: 45 °C, 5 % de carga y 46,6 W.

## Auditoría adicional 0.4.0

- Una muestra térmica obsoleta se elimina de la pantalla y la potencia pasa a “Sensor no disponible”.
- El lector local se recupera después de un cierre inesperado y controla errores de arranque.
- La aplicación usa instancia única para evitar colisiones del puerto local.
- El estrés GPU se bloquea si no existe temperatura real para aplicar el corte térmico.
- El corte térmico CPU se comprueba cada segundo.
- El inventario ya no muestra campos vacíos como completos: se marca como limitado y conserva los datos reales disponibles.
- Primera consulta de inventario restringido: 4,94 s; consultas posteriores en caché: 4 ms.
- Consumo medido del servicio en reposo: 0,89 % de CPU del sistema.

## Integridad de entregables

- `PulseGuard-Setup-0.4.1.exe`: `7752EB3A09702BB47E014B2E78A6B1037A2440AFB262C331F076DACA4DF2451C`
- `PulseGuard-PWA-0.2.0.zip`: `AA149BA036B4D508ACA7F0FDBB75E2CE4B2A3A40C1459FBD21688B34ED11D079`
- El controlador PawnIO 2.1 incluido tiene firma Authenticode válida de `namazso.eu`.
- El instalador PulseGuard aún no tiene firma de editor (`NotSigned`); Windows puede mostrar SmartScreen hasta firmarlo con un certificado propio de firma de código.

## Alcance pendiente de validación

La automatización visual del navegador no pudo ejecutarse en este entorno por una restricción de permisos al crear el proceso. Sí se validaron compilación TypeScript, paquete Windows, API real, telemetría, estrés, limpieza y estructura PWA. La compatibilidad final debe probarse además en una matriz de equipos AMD/Intel/NVIDIA y dispositivos Android/iOS reales.
