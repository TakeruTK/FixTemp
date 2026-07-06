# PulseGuard

## Novedades 0.6.0

- Pruebas reales de CPU, GPU, RAM y disco con verificación del trabajo realizado.
- Gráficas sincronizadas de actividad, temperatura y potencia durante cada sesión.
- Informe final con máximos, cambio térmico, consumo medio, energía e integridad.
- Overlay de escritorio configurable para CPU, GPU, RAM, VRAM, temperaturas y watts.
- Exportación de informe completo del equipo para fase de pruebas entre distintos PCs.
- Los FPS sólo se muestran cuando exista un proveedor de cuadros real; nunca se estiman.

Monitor local de hardware para Windows y Linux, además de una PWA para móviles/tablets. Muestra CPU, GPU, RAM, red, discos y procesos, e incluye pruebas controladas de CPU, GPU, memoria y almacenamiento.

## Abrir la aplicación

Haz doble clic en `INICIAR.bat`. El panel se abrirá en el navegador y el servicio permanecerá activo mientras la ventana de PulseGuard siga abierta.

Para desarrollo, con Node.js y pnpm instalados:

```powershell
pnpm install
pnpm dev
```

La versión de producción se genera con `pnpm build` y se sirve desde `http://127.0.0.1:4310`.

## Generar el instalador de Windows

```powershell
pnpm dist:win
```

El instalador se crea en la carpeta `release`. Incluye una opción para iniciar PulseGuard con Windows y registra el desinstalador en Aplicaciones instaladas/Panel de control. También incorpora la aplicación, el lector SYSTEM y el controlador firmado PawnIO; el equipo de destino no necesita instalar Node.js ni .NET.

## Generar la beta de Linux

```bash
pnpm dist:linux
```

Esto genera una AppImage y un paquete `.tar.gz` en `release`. En Linux reutilizamos la misma interfaz y el mismo motor de pruebas, pero la cobertura de sensores depende de lo que expongan `systeminformation`, el kernel, los drivers y herramientas del sistema como `lm-sensors` o `nvidia-smi`.

## Móvil y tablet

La carpeta `dist` es una PWA instalable cuando se publica mediante HTTPS. Android, iOS y iPadOS pueden ejecutar el diagnóstico local, historial y prueba intensiva limitada a 10 segundos. Consulta [MOBILE.md](MOBILE.md) para conocer qué sensores requieren una aplicación nativa.

## Validación

```powershell
pnpm check
pnpm build
pnpm test:telemetry
pnpm test:stress
pnpm test:features
pnpm test:pwa
pnpm test:sensors
pnpm test:inventory
```

## Pruebas y seguridad

- CPU: carga multinúcleo con intensidad regulable.
- GPU: carga WebGL 2 ejecutada en el navegador.
- RAM: reserva y verifica bloques de memoria, limitada a un máximo de 4 GB.
- Disco: escribe, lee y elimina un archivo temporal; no modifica archivos personales.
- Todas las pruebas tienen duración máxima, parada manual y límite térmico. El estrés CPU se bloquea si la temperatura real está ausente u obsoleta.

La temperatura, frecuencia por núcleo y potencia CPU se leen con LibreHardwareMonitor + PawnIO en Intel y AMD sobre Windows. En Linux el inventario y la telemetría usan la misma app, pero la disponibilidad real depende del kernel, los drivers y los sensores expuestos por cada equipo. Cada dato declara su fuente; una lectura no disponible nunca se reemplaza por un valor inventado.
