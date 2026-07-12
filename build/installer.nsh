!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER

Var StartWithWindowsCheckbox
Var StartWithWindows

!macro customInit
  nsExec::ExecToStack 'taskkill /IM FixTemp.exe /F'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /IM PulseGuard.exe /F'
  Pop $0
  Pop $1
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
  ${NSD_CreateLabel} 0 0 100% 28u "Puedes iniciar FixTemp automáticamente al ingresar a Windows o abrirlo manualmente desde el menú Inicio."
  Pop $0
  ${NSD_CreateCheckbox} 0 40u 100% 14u "Iniciar FixTemp al iniciar sesión en Windows"
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
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\sensor-helper\install-sensors.ps1" -InstallDir "$INSTDIR" -EnableAppStartup -RelaunchApp'
  ${Else}
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\sensor-helper\install-sensors.ps1" -InstallDir "$INSTDIR" -RelaunchApp'
  ${EndIf}
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "FixTemp no pudo activar el lector real de temperatura. La instalacion se cancelara para evitar mostrar datos incompletos."
    Abort
  ${EndIf}
!macroend

!endif

!macro customUnInstall
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\sensor-helper\install-sensors.ps1" -InstallDir "$INSTDIR" -Uninstall'
  Pop $0
  Pop $1
!macroend
