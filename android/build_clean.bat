@echo off
setlocal
set JAVA_HOME=D:\android_sdk\android_build\jdk_raw\jdk-17.0.20+8
set ANDROID_HOME=D:\android_sdk
set PATH=C:\Users\lj\.workbuddy\binaries\node\versions\22.22.2;D:\android_sdk\android_build\jdk_raw\jdk-17.0.20+8\bin;D:\android_sdk\platform-tools;D:\android_sdk\build-tools\35.0.0;C:\Windows\system32;C:\Windows;%PATH%
call gradlew.bat %*
endlocal
