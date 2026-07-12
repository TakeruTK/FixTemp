; ============================================================
; FixTemp - Instalador NSIS
; Compilar: clic derecho en este archivo -> "Compile NSIS Script"
; Requiere: NSIS 3.x https://nsis.sourceforge.io/
; ============================================================

!define APP_NAME "FixTemp"
!define APP_VERSION "0.6.0"
!define APP_PUBLISHER "FixTemp"
!define APP_EXE "FixTemp.exe"
!define SRC_DIR "portable-060"
!define UNINST_KEY "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\FixTemp"
!define REG_KEY "SOFTWARE\FixTemp"

; ---- Configuracion general ----
Name "${APP_NAME} ${APP_VERSION}"
OutFile "FixTemp-Setup-v${APP_VERSION}.exe"
InstallDir "$PROGRAMFILES64\FixTemp"
InstallDirRegKey HKLM "${REG_KEY}" "Install_Dir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
Unicode True

; ---- MUI2 ----
!include "MUI2.nsh"

!define MUI_ICON "fixtemp-icon.ico"
!define MUI_UNICON "fixtemp-icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Iniciar FixTemp ahora"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Spanish"

; ============================================================
; SECCION: Instalacion
; ============================================================
Section "${APP_NAME}" SecMain
 SectionIn RO

 ; Cerrar instancia si esta corriendo
 DetailPrint "Verificando instancias previas..."
 ExecWait 'taskkill /F /IM "${APP_EXE}"' $0

 SetOutPath "$INSTDIR"
 File /r "${SRC_DIR}\*.*"

 ; Acceso directo - Escritorio
 CreateShortCut "$DESKTOP\${APP_NAME}.lnk" \
 "$INSTDIR\${APP_EXE}" "" \
 "$INSTDIR\${APP_EXE}" 0

 ; Acceso directo - Menu Inicio
 CreateDirectory "$SMPROGRAMS\${APP_NAME}"
 CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" \
 "$INSTDIR\${APP_EXE}" "" \
 "$INSTDIR\${APP_EXE}" 0
 CreateShortCut "$SMPROGRAMS\${APP_NAME}\Desinstalar ${APP_NAME}.lnk" \
 "$INSTDIR\Uninstall.exe"

 ; Registro - directorio
 WriteRegStr HKLM "${REG_KEY}" "Install_Dir" "$INSTDIR"

 ; Registro - panel de control "Agregar o quitar programas"
 WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${APP_NAME} - Monitor del sistema"
 WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
 WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "${APP_PUBLISHER}"
 WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
 WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
 WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
 WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
 WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
 WriteRegDWORD HKLM "${UNINST_KEY}" "EstimatedSize" 400000

 ; Crear desinstalador
 WriteUninstaller "$INSTDIR\Uninstall.exe"

 DetailPrint "Instalacion completada en $INSTDIR"
SectionEnd

; ============================================================
; SECCION: Desinstalacion
; ============================================================
Section "Uninstall"
 ; Cerrar si esta corriendo
 ExecWait 'taskkill /F /IM "${APP_EXE}"' $0

 ; Borrar archivos instalados
 RMDir /r "$INSTDIR"

 ; Borrar accesos directos
 Delete "$DESKTOP\${APP_NAME}.lnk"
 RMDir /r "$SMPROGRAMS\${APP_NAME}"

 ; Limpiar registro
 DeleteRegKey HKLM "${UNINST_KEY}"
 DeleteRegKey HKLM "${REG_KEY}"

 DetailPrint "FixTemp desinstalado correctamente."
SectionEnd
