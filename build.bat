@echo off
setlocal
set DIR=%~dp0

if defined JAVA_HOME (
    set JAVAC="%JAVA_HOME%\bin\javac.exe"
    set JAR="%JAVA_HOME%\bin\jar.exe"
) else (
    for /f "tokens=2 delims==" %%i in ('wmic os get javahome /value ^| find "="') do set JH=%%i
    if not defined JH (
        echo JAVA_HOME not set. Please set JAVA_HOME or add javac to PATH.
        exit /b 1
    )
    set JAVAC="%JH%\bin\javac.exe"
    set JAR="%JH%\bin\jar.exe"
)

%JAVAC% -encoding UTF-8 -d "%DIR%build" "%DIR%src\main\java\com\jcurl\*.java"
if errorlevel 1 exit /b 1

%JAR% cfe "%DIR%jcurl.jar" com.jcurl.CurlApp -C "%DIR%build" com/jcurl
if not exist "%DIR%jcurl.jar" (
    echo Build failed: jcurl.jar not created.
    exit /b 1
)
echo Built %DIR%jcurl.jar