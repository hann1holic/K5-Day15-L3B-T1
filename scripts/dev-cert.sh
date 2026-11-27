#!/usr/bin/env bash
# Chạy từ bất kỳ thư mục nào: bash scripts/dev-cert.sh [IP/hostname ...]
set -eu
umask 077

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cert_dir="$repo_root/certs"
hosts=(localhost 127.0.0.1)

case "$(uname -s)" in
  Darwin) lan_ip=$(ipconfig getifaddr en0 2>/dev/null || true) ;;
  Linux) lan_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true) ;;
  *) lan_ip="" ;;
esac
if [ -n "$lan_ip" ]; then
  hosts+=("$lan_ip")
else
  printf '%s\n' 'Chưa dò được IP LAN; truyền thêm IP nếu thử trên nhiều máy.' >&2
fi
hosts+=("$@")

# Chỉ nhận IP/hostname, không nhận URL hay nội dung cấu hình OpenSSL.
for host in "${hosts[@]}"; do
  if [[ ! "$host" =~ ^[[:alnum:]][[:alnum:].:-]*$ ]]; then
    printf 'IP/hostname không hợp lệ: %s\n' "$host" >&2
    exit 1
  fi
done

mkdir -p "$cert_dir"
if command -v mkcert >/dev/null 2>&1; then
  mkcert -cert-file "$cert_dir/dev.crt" -key-file "$cert_dir/dev.key" "${hosts[@]}"
  printf '%s\n' 'Đã dùng mkcert. Chạy mkcert -install nếu máy này chưa tin CA của mkcert.'
  printf '%s\n' 'Máy khác cần tin rootCA.pem của cùng CA; không chia sẻ rootCA-key.pem.'
else
  if ! command -v openssl >/dev/null 2>&1; then
    printf '%s\n' 'Cần openssl hoặc mkcert để tạo cert.' >&2
    exit 1
  fi
  config=$(mktemp "${TMPDIR:-/tmp}/ma-soi-cert.XXXXXX")
  trap 'rm -f "$config"' EXIT
  cat > "$config" <<'CONFIG'
[req]
prompt = no
distinguished_name = subject
x509_extensions = extensions
[subject]
CN = localhost
[extensions]
subjectAltName = @san
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
[san]
CONFIG
  index=0
  for host in "${hosts[@]}"; do
    index=$((index + 1))
    if [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "$host" == *:* ]]; then
      printf 'IP.%s = %s\n' "$index" "$host" >> "$config"
    else
      printf 'DNS.%s = %s\n' "$index" "$host" >> "$config"
    fi
  done
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 30 \
    -keyout "$cert_dir/dev.key" -out "$cert_dir/dev.crt" -config "$config"
  printf '%s\n' 'Đã dùng OpenSSL: cert tự ký dùng cho dev, có hạn 30 ngày.'
  printf '%s\n' 'Mỗi máy cần chấp nhận/tin cert cho cả HTTPS :5173 và WSS :8000.'
fi
chmod 600 "$cert_dir/dev.key"
printf 'Đã tạo: %s/dev.crt và %s/dev.key\n' "$cert_dir" "$cert_dir"
printf 'SAN: %s\n' "${hosts[*]}"
printf '%s\n' 'Khởi động lại Vite và chạy server với --certfile certs/dev.crt --keyfile certs/dev.key.'
printf '%s\n' 'Xem docs/voice.md. Đổi IP LAN thì chạy lại script. Không commit cert/key.'
