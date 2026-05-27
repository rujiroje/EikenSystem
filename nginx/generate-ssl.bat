@echo off
REM สร้าง Self-Signed SSL Certificate สำหรับ nginx (Windows)
REM ใช้งาน: generate-ssl.bat 10.1.53.32
REM          (ใส่ IP หรือ hostname ของ server จริง)
REM ต้องการ OpenSSL — มักติดมากับ Git for Windows

SET SERVER_IP=%1
IF "%SERVER_IP%"=="" SET SERVER_IP=10.1.53.32

SET OUT_DIR=%~dp0ssl
SET DAYS=825

echo =^> สร้าง SSL Certificate สำหรับ IP: %SERVER_IP%
echo =^> ไฟล์จะถูกบันทึกใน: %OUT_DIR%

IF NOT EXIST "%OUT_DIR%" mkdir "%OUT_DIR%"

REM สร้าง openssl config
(
echo [req]
echo default_bits       = 2048
echo prompt             = no
echo default_md         = sha256
echo distinguished_name = dn
echo x509_extensions    = v3_req
echo.
echo [dn]
echo C  = TH
echo ST = Bangkok
echo L  = Bangkok
echo O  = Eikensystem
echo CN = %SERVER_IP%
echo.
echo [v3_req]
echo subjectAltName = @alt_names
echo keyUsage       = digitalSignature, keyEncipherment
echo extendedKeyUsage = serverAuth
echo.
echo [alt_names]
echo IP.1 = %SERVER_IP%
echo IP.2 = 127.0.0.1
echo DNS.1 = localhost
) > "%OUT_DIR%\openssl.cnf"

REM หา OpenSSL (Git for Windows)
SET OPENSSL=openssl
WHERE openssl >nul 2>&1
IF ERRORLEVEL 1 (
    IF EXIST "C:\Program Files\Git\usr\bin\openssl.exe" (
        SET OPENSSL=C:\Program Files\Git\usr\bin\openssl.exe
    ) ELSE (
        echo [ERROR] ไม่พบ OpenSSL — ติดตั้ง Git for Windows หรือเพิ่ม openssl ใน PATH
        pause
        exit /b 1
    )
)

"%OPENSSL%" req -x509 -newkey rsa:2048 -nodes ^
  -keyout "%OUT_DIR%\server.key" ^
  -out    "%OUT_DIR%\server.crt" ^
  -days   %DAYS% ^
  -config "%OUT_DIR%\openssl.cnf"

echo.
echo =^> สำเร็จ! ไฟล์ที่สร้าง:
echo     %OUT_DIR%\server.crt
echo     %OUT_DIR%\server.key
echo.
echo =^> ขั้นตอนต่อไปดูใน generate-ssl.sh
pause
