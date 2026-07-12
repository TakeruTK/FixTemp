!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER

Var StartWithWindowsCheckbox
Var StartWithWindows

!macro customInit
  StrCpy $StartWithWindows "1"
!macroend

!macro customPageAfterChangeDir
  Page custom StartupOptionsCreate StartupOptionsLeave
!macroend

Function StartupOptionsCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 28u "Puedes iniciar FixTemp automÃ¡ticamente al ingresar a Windows o abrirlo manualmente desde el menÃº Inicio."
  Pop $0
  ${NSD_CreateCheckbox} 0 40u 100% 14u "Iniciar FixTemp al iniciar sesiÃ³n en Windows"
  Pop $StartWithWindowsCheckbox
  ${If} $StartWithWindows == "1"
    ${NSD_Check} $StartWithWindowsCheckbox
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function StartupOptionsLeave
  ${NSD_GetState} $StartWithWindowsCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $StartWithWindows "1"
  ${Else}
    StrCpy $StartWithWindows "0"
  ${EndIf}
FunctionEnd

!macro customInstall
  ${If} $StartWithWindows == "1"
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\sensor-helper\install-sensors.ps1" -InstallDir "$INSTDIR" -EnableAppStartup'
    Pop $0
  ${Else}
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\sensor-helper\install-sensors.ps1" -InstallDir "$INSTDIR"'
    Pop $0
  ${EndIf}
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "FixTemp no pudo activar el lector real de temperatura. La instalacion se cancelara para evitar mostrar datos incompletos."
    Abort
  ${EndIf}
!macroend

!endif

!macro customUnInstall
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\sensor-helper\install-sensors.ps1" -InstallDir "$INSTDIR" -Uninstall'
  Pop $0
!macroend
