; Registers the CarrotCam virtual camera right after install (per user, no
; admin required) and removes the registration on uninstall. The app also
; re-checks the driver on every launch.
!macro customInstall
  DetailPrint "Installing the CarrotCam virtual camera..."
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --install-driver'
!macroend

!macro removeCarrotCamDriver
  DeleteRegKey HKCU "Software\Classes\CLSID\{73EEB1BE-1807-4FBB-AB20-AA1364E1A8D2}"
  DeleteRegKey HKCU "Software\Classes\CLSID\{860BB310-5D01-11d0-BD3B-00A0C911CE86}\Instance\CarrotCam"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    SetRegView 64
    !insertmacro removeCarrotCamDriver
    SetRegView 32
    !insertmacro removeCarrotCamDriver
    DeleteRegKey HKCU "Software\CarrotCam"
    RMDir /r "$LOCALAPPDATA\CarrotCam\driver"
  ${endIf}
!macroend
