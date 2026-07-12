# FixTemp

## Novedades 0.6.3

- Pruebas reales de CPU, GPU, RAM y disco con verificaciÃ³n del trabajo realizado.
- GrÃ¡ficas sincronizadas de actividad, temperatura y potencia durante cada sesiÃ³n.
- Informe final con mÃ¡ximos, cambio tÃ©rmico, consumo medio, energÃ­a e integridad.
- Overlay de escritorio configurable para CPU, GPU, RAM, VRAM, temperaturas y watts.
- ExportaciÃ³n de informe completo del equipo para fase de pruebas entre distintos PCs.
- Los FPS sÃ³lo se muestran cuando exista un proveedor de cuadros real; nunca se estiman.

Monitor local de hardware para Windows y Linux, ademÃ¡s de una PWA para mÃ³viles/tablets. Muestra CPU, GPU, RAM, red, discos y procesos, e incluye pruebas controladas de CPU, GPU, memoria y almacenamiento.

## Abrir la aplicaciÃ³n

Haz doble clic en `INICIAR.bat`. El panel se abrirÃ¡ en el navegador y el servicio permanecerÃ¡ activo mientras la ventana de FixTemp siga abierta.

Para desarrollo, con Node.js y pnpm instalados:

```powershell
pnpm install
pnpm dev
```

La versiÃ³n de producciÃ³n se genera con `pnpm build` y se sirve desde `http://127.0.0.1:4310`.

## Generar el instalador de Windows

```powershell
pnpm dist:win
```

El instalador se crea en la carpeta `release`. Incluye una opciÃ³n para iniciar FixTemp con Windows y registra el desinstalador en Aplicaciones instaladas/Panel de control. TambiÃ©n incorpora la aplicaciÃ³n, el lector SYSTEM y el controlador firmado PawnIO; el equipo de destino no necesita instalar Node.js ni .NET.

## Publicar una actualizacion

El actualizador integrado consulta la ultima release publicada en GitHub. Para publicar una nueva version:

```powershell
git tag v0.6.3
git push origin v0.6.3
```

GitHub Actions generara el instalador de Windows y lo adjuntara a la release. Las instalaciones con una version anterior detectaran esa release desde la pantalla Actualizaciones.

## Generar la beta de Linux

```bash
pnpm dist:linux
```

Esto genera una AppImage y un paquete `.tar.gz` en `release`. En Linux reutilizamos la misma interfaz y el mismo motor de pruebas, pero la cobertura de sensores depende de lo que expongan `systeminformation`, el kernel, los drivers y herramientas del sistema como `lm-sensors` o `nvidia-smi`.

## MÃ³vil y tablet

La carpeta `dist` es una PWA instalable cuando se publica mediante HTTPS. Android, iOS y iPadOS pueden ejecutar el diagnÃ³stico local, historial y prueba intensiva limitada a 10 segundos. Consulta [MOBILE.md](MOBILE.md) para conocer quÃ© sensores requieren una aplicaciÃ³n nativa.

## ValidaciÃ³n

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

- CPU: carga multinÃºcleo con intensidad regulable.
- GPU: carga WebGL 2 ejecutada en el navegador.
- RAM: reserva y verifica bloques de memoria, limitada a un mÃ¡ximo de 4 GB.
- Disco: escribe, lee y elimina un archivo temporal; no modifica archivos personales.
- Todas las pruebas tienen duraciÃ³n mÃ¡xima, parada manual y lÃ­mite tÃ©rmico. El estrÃ©s CPU se bloquea si la temperatura real estÃ¡ ausente u obsoleta.

La temperatura, frecuencia por nÃºcleo y potencia CPU se leen con LibreHardwareMonitor + PawnIO en Intel y AMD sobre Windows. En Linux el inventario y la telemetrÃ­a usan la misma app, pero la disponibilidad real depende del kernel, los drivers y los sensores expuestos por cada equipo. Cada dato declara su fuente; una lectura no disponible nunca se reemplaza por un valor inventado.
