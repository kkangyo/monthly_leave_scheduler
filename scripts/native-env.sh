# Docker 없이 실행하는 환경(루팅폰 arm64 Ubuntu chroot 등)용 공통 설정.
# setup-native.sh / start-native.sh / exit-native.sh 에서 source 한다.
# PC(Docker) 와 같은 config/.server.env 를 그대로 쓰고, DB_HOST 만 127.0.0.1 로 덮어쓴다.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NATIVE_DIR="${NATIVE_DIR:-/opt/leave-schedule}"
MYSQL_VERSION="8.4.13" # server/docker-compose.yml 의 mysql 이미지 태그와 맞출 것
NODE_VERSION="16.18.0" # server/dockerfile 의 node 이미지 태그와 맞출 것

MYSQL_BASE="$NATIVE_DIR/mysql"
MYSQL_DATA="$NATIVE_DIR/mysql-data"
MYSQL_CNF="$NATIVE_DIR/my.cnf"
MYSQL_SOCK="$NATIVE_DIR/run/mysqld.sock"

SERVER_PM2_NAME="server-leave-schedule"
CLIENT_PM2_NAME="client-leave-schedule"

export PATH="$NATIVE_DIR/node/bin:$MYSQL_BASE/bin:$PATH"

set -a
. "$ROOT_DIR/config/.server.env"
set +a
export DB_HOST="127.0.0.1"

CLIENT_PORT="$(sed -n 's/^PORT=//p' "$ROOT_DIR/config/.client.env" | tr -d '"'\''\r')"

# 소켓으로 root 접속 (비밀번호는 .server.env 의 DB_PSWORD)
mysql_root() {
  MYSQL_PWD="$DB_PSWORD" mysql --defaults-file="$MYSQL_CNF" -uroot "$@"
}

# 접속 거부여도 서버가 떠 있으면 성공
mysql_running() {
  mysqladmin --defaults-file="$MYSQL_CNF" -uroot ping >/dev/null 2>&1
}

mysql_start() {
  if mysql_running; then
    echo "MySQL already running"
    return
  fi
  mysqld --defaults-file="$MYSQL_CNF" --daemonize >/dev/null
  for _ in $(seq 1 60); do
    mysql_running && { echo "MySQL started"; return; }
    sleep 1
  done
  echo "MySQL 기동 실패 — $NATIVE_DIR/log/mysqld.err 확인" >&2
  return 1
}

mysql_stop() {
  if mysql_running; then
    MYSQL_PWD="$DB_PSWORD" mysqladmin --defaults-file="$MYSQL_CNF" -uroot shutdown
    # shutdown 은 바로 반환되므로 pid 파일이 사라질 때까지 대기
    for _ in $(seq 1 60); do
      [ -f "$NATIVE_DIR/run/mysqld.pid" ] || break
      sleep 1
    done
    echo "MySQL stopped"
  fi
}
