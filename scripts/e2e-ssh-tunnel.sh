#!/bin/sh
# End-to-end test of the built-in SSH tunnel, 100% in throwaway containers:
#   - two internal docker networks (no route outside): the database network
#     (postgres + sshd) and the client network (sshd + test runner), so the
#     test runner can reach postgres ONLY through the SSH tunnel;
#   - postgres:18-alpine with a random password and TLS on (self-signed
#     certificate generated per run), so SSL through the tunnel is tested too;
#   - an sshd (alpine + openssh) with host keys generated at start, an
#     unprivileged user and AllowTcpForwarding yes;
#   - a client ed25519 key with a random passphrase, generated per run;
#   - node:22-alpine running tests/integration/db/ssh-tunnel-postgres.test.ts.
# Nothing touches the host's ~/.ssh or any real server. Needs `npm ci` done
# (node_modules present) and docker.
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
ID="$$"
NET="mcp-pg-e2e-$ID"
CLIENT_NET="mcp-pg-e2e-client-$ID"
PG="mcp-pg-e2e-db-$ID"
SSHD="mcp-pg-e2e-sshd-$ID"
IMG="mcp-pg-e2e-sshd:local"
WORK="$(mktemp -d)"

rand() { head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
PG_PASS="$(rand)"
KEY_PASS="$(rand)"

cleanup() {
  docker rm -f "$PG" "$SSHD" >/dev/null 2>&1 || true
  docker network rm "$NET" "$CLIENT_NET" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

docker build -q -t "$IMG" - >/dev/null <<'EOF'
FROM alpine:3.22
RUN apk add --no-cache openssh-server openssh-keygen openssl \
 && adduser -D -s /sbin/nologin tunnel \
 && sed -i 's/^tunnel:!/tunnel:*/' /etc/shadow
CMD ["/bin/sh", "-c", "ssh-keygen -A >/dev/null && install -d -o tunnel -g tunnel -m 700 /home/tunnel/.ssh && printf '%s\\n' \"$PUBKEY\" > /home/tunnel/.ssh/authorized_keys && chown tunnel:tunnel /home/tunnel/.ssh/authorized_keys && chmod 600 /home/tunnel/.ssh/authorized_keys && exec /usr/sbin/sshd -D -e -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o PermitRootLogin=no -o AllowTcpForwarding=yes -o AllowUsers=tunnel"]
EOF

# Client key (encrypted with a random passphrase), owned by the calling user
docker run --rm --user "$(id -u):$(id -g)" -v "$WORK":/k "$IMG" \
  ssh-keygen -q -t ed25519 -N "$KEY_PASS" -C mcp-e2e -f /k/id_ed25519

# Self-signed TLS certificate for postgres (CN = container name)
docker run --rm --user "$(id -u):$(id -g)" -v "$WORK":/k "$IMG" \
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=$PG" \
  -keyout /k/server.key -out /k/server.crt 2>/dev/null

docker network create --internal "$NET" >/dev/null
docker network create --internal "$CLIENT_NET" >/dev/null
docker run -d --name "$PG" --network "$NET" -e POSTGRES_PASSWORD="$PG_PASS" \
  -v "$WORK":/certs:ro --entrypoint sh postgres:18-alpine -c '
    install -o postgres -m 600 /certs/server.key /srv.key &&
    install -o postgres -m 644 /certs/server.crt /srv.crt &&
    exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/srv.crt -c ssl_key_file=/srv.key' >/dev/null
docker run -d --name "$SSHD" --network "$NET" -e PUBKEY="$(cat "$WORK/id_ed25519.pub")" "$IMG" >/dev/null
docker network connect "$CLIENT_NET" "$SSHD"

for _ in $(seq 1 60); do
  docker exec "$PG" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done
for _ in $(seq 1 30); do
  docker exec "$SSHD" nc -z 127.0.0.1 22 2>/dev/null && break
  sleep 1
done

# All host key fingerprints, comma separated (exercises the list form)
FPS="$(docker exec "$SSHD" sh -c 'for f in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf "$f" | cut -d" " -f2; done' | paste -sd, -)"

docker run --rm --network "$CLIENT_NET" --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -e TEST_SSH_HOST="$SSHD" \
  -e TEST_SSH_PORT=22 \
  -e TEST_SSH_USER=tunnel \
  -e TEST_SSH_KEY_PATH=/e2e/id_ed25519 \
  -e TEST_SSH_KEY_PASSPHRASE="$KEY_PASS" \
  -e TEST_SSH_HOST_FINGERPRINT="$FPS" \
  -e TEST_PG_TUNNEL_SSL=true \
  -e TEST_PG_TUNNEL_URL="postgres://postgres:${PG_PASS}@${PG}:5432/postgres" \
  -v "$REPO":/app -v "$WORK":/e2e:ro -w /app node:22-alpine \
  npx vitest run tests/integration/db/ssh-tunnel-postgres.test.ts
