#!/usr/bin/env bash
# สร้าง Self-Signed SSL Certificate สำหรับ nginx
# ใช้งาน: bash generate-ssl.sh 10.1.53.32
#          (ใส่ IP หรือ hostname ของ server จริง)

set -e

SERVER_IP="${1:-10.1.53.32}"
OUT_DIR="$(dirname "$0")/ssl"
DAYS=825   # ~2 ปี (Chrome จำกัด 825 วัน)

echo "==> สร้าง SSL Certificate สำหรับ IP: $SERVER_IP"
echo "==> ไฟล์จะถูกบันทึกใน: $OUT_DIR"

mkdir -p "$OUT_DIR"

# OpenSSL config ที่มี SAN สำหรับ IP address
cat > "$OUT_DIR/openssl.cnf" <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
C  = TH
ST = Bangkok
L  = Bangkok
O  = Eikensystem
CN = $SERVER_IP

[v3_req]
subjectAltName = @alt_names
keyUsage       = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
IP.1 = $SERVER_IP
IP.2 = 127.0.0.1
DNS.1 = localhost
EOF

# สร้าง private key และ certificate
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$OUT_DIR/server.key" \
  -out    "$OUT_DIR/server.crt" \
  -days   $DAYS \
  -config "$OUT_DIR/openssl.cnf"

echo ""
echo "==> สำเร็จ! ไฟล์ที่สร้าง:"
echo "    $OUT_DIR/server.crt"
echo "    $OUT_DIR/server.key"
echo ""
echo "==> ขั้นตอนต่อไป:"
echo "    1. แก้ไข application-prod.yml: rp-id และ origins ให้ตรงกับ $SERVER_IP"
echo "    2. แก้ไข frontend/.env.production: VITE_API_BASE ให้ว่าง (ใช้ same-origin)"
echo "    3. cd frontend && npm run build"
echo "    4. docker compose up -d"
echo "    5. java -jar backend-spring/target/*.jar --spring.profiles.active=prod"
echo ""
echo "    บน Android Tablet: เปิด https://$SERVER_IP"
echo "    ครั้งแรกจะมีแจ้งเตือน 'cert ไม่น่าเชื่อถือ' — กด Advanced → Proceed เพื่อยอมรับ"
