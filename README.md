# FixTemp

## Novedades 0.6.4

- Textos corregidos para evitar letras rotas o codificacion mezclada en la interfaz.
- Selector de idioma simplificado a Espanol e English mientras se limpian traducciones incompletas.
- Pruebas reales de CPU, GPU, RAM y disco con verificacion del trabajo realizado.
- Graficas sincronizadas de actividad, temperatura y potencia durante cada sesion.
- Informe final con maximos, cambio termico, consumo medio, energia e integridad.
- Overlay de escritorio configurable para CPU, GPU, RAM, VRAM, temperaturas y watts.
- Exportacion de informe completo del equipo para fase de pruebas entre distintos PCs.
- Los FPS solo se muestran cuando exista un proveedor de cuadros real; nunca se estiman.

Monitor local de hardware para Windows y Linux, ademas de una PWA para moviles/tablets. Muestra CPU, GPU, RAM, red, discos y procesos, e incluye pruebas controladas de CPU, GPU, memoria y almacenamiento.

## Abrir la aplicacion

Haz doble clic en `INICIAR.bat`. El panel se abrira en el navegador y el servicio permanecera activo mientras la ventana de FixTemp siga abierta.

Para desarrollo, con Node.js y pnpm instalados:

```powershell
pnpm install
pnpm dev
```

La version de produccion se genera con `pnpm build` y se sirve desde `http://127.0.0.1:4310`.

## Generar el instalador de Windows

```powershell
pnpm dist:win
```

El instalador se crea en la carpeta `release`. Incluye una opcion para iniciar FixTemp con Windows y registra el desinstalador en Aplicaciones instaladas/Panel de control. Tambien incorpora la aplicacion, el lector SYSTEM y el controlador firmado PawnIO; el equipo de destino no necesita instalar Node.js ni .NET.

## Publicar una actualizacion

El actualizador integrado consulta la ultima release publicada en GitHub. Para publicar una nueva version:

```powershell
git tag v0.6.4
git push origin v0.6.4
```

GitHub Actions generara el instalador de Windows y lo adjuntara a la release. Las instalaciones con una version anterior detectaran esa release desde la pantalla Actualizaciones.

## Generar la beta de Linux

```bash
pnpm dist:linux
```

Esto genera una AppImage y un paquete `.tar.gz` en `release`. En Linux reutilizamos la misma interfaz y el mismo motor de pruebas, pero la cobertura de sensores depende de lo que expongan `systeminformation`, el kernel, los drivers y herramientas del sistema como `lm-sensors` o `nvidia-smi`.

## Movil y tablet

La carpeta `dist` es una PWA instalable cuando se publica mediante HTTPS. Android, iOS y iPadOS pueden ejecutar el diagnostico local, historial y prueba intensiva limitada a 10 segundos. Consulta [MOBILE.md](MOBILE.md) para conocer que sensores requieren una aplicacion nativa.

## Validacion

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

- CPU: carga multinucleo con intensidad regulable.
- GPU: carga WebGL 2 ejecutada en el navegador.
- RAM: reserva y verifica bloques de memoria, limitada a un maximo de 4 GB.
- Disco: escribe, lee y elimina un archivo temporal; no modifica archivos personales.
- Todas las pruebas tienen duracion maxima, parada manual y limite termico. El estres CPU se bloquea si la temperatura real esta ausente u obsoleta.

La temperatura, frecuencia por nucleo y potencia CPU se leen con LibreHardwareMonitor + PawnIO en Intel y AMD sobre Windows. En Linux el inventario y la telemetria usan la misma app, pero la disponibilidad real depende del kernel, los drivers y los sensores expuestos por cada equipo. Cada dato declara su fuente; una lectura no disponible nunca se reemplaza por un valor inventado.
