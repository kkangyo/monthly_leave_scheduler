# Docker 를 쓸 수 없는 환경(루팅폰 arm64 Ubuntu chroot 등)에서 최초 1회 실행.
# Node / pm2 / MySQL 을 $NATIVE_DIR 에 설치하고, npm 의존성 설치 + DB/테이블 생성까지 한다.
# npm 이 아직 없을 수 있으므로 npm run 이 아니라 bash 로 직접 실행한다.
#   bash scripts/setup-native.sh               # 빈 DB 로 시작
#   bash scripts/setup-native.sh dump.sql      # mysqldump 파일 복원
# 다시 실행해도 이미 설치된 것은 건너뛴다.
set -euo pipefail
source "$(dirname "$0")/native-env.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "root 로 실행해야 합니다 (apt 설치, $NATIVE_DIR 쓰기)." >&2
  exit 1
fi

DUMP_FILE="${1:-}"
if [ -n "$DUMP_FILE" ]; then
  [ -f "$DUMP_FILE" ] || { echo "dump 파일 없음: $DUMP_FILE" >&2; exit 1; }
  DUMP_FILE="$(cd "$(dirname "$DUMP_FILE")" && pwd)/$(basename "$DUMP_FILE")"
fi

case "$(uname -m)" in
  aarch64 | arm64)
    NODE_ARCH="arm64"
    MYSQL_PKG="mysql-$MYSQL_VERSION-linux-glibc2.28-aarch64"
    ;;
  x86_64)
    NODE_ARCH="x64"
    MYSQL_PKG="mysql-$MYSQL_VERSION-linux-glibc2.28-x86_64-minimal"
    ;;
  *)
    echo "지원하지 않는 아키텍처: $(uname -m)" >&2
    exit 1
    ;;
esac

echo "==> apt 패키지"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  curl ca-certificates xz-utils libaio1 libnuma1

mkdir -p "$NATIVE_DIR/downloads" "$NATIVE_DIR/run" "$NATIVE_DIR/log"

echo "==> Node v$NODE_VERSION"
if [ ! -x "$NATIVE_DIR/node/bin/node" ]; then
  NODE_PKG="node-v$NODE_VERSION-linux-$NODE_ARCH"
  curl -fL "https://nodejs.org/dist/v$NODE_VERSION/$NODE_PKG.tar.xz" -o "$NATIVE_DIR/downloads/$NODE_PKG.tar.xz"
  tar -xJf "$NATIVE_DIR/downloads/$NODE_PKG.tar.xz" -C "$NATIVE_DIR"
  ln -sfn "$NATIVE_DIR/$NODE_PKG" "$NATIVE_DIR/node"
  rm -f "$NATIVE_DIR/downloads/$NODE_PKG.tar.xz"
fi
[ -x "$NATIVE_DIR/node/bin/pm2" ] || npm install -g pm2
# 새 셸에서도 npm run start:native 가 되도록
for bin in node npm npx pm2; do
  ln -sf "$NATIVE_DIR/node/bin/$bin" "/usr/local/bin/$bin"
done

echo "==> MySQL $MYSQL_VERSION"
if [ ! -x "$MYSQL_BASE/bin/mysqld" ]; then
  MYSQL_URL="https://cdn.mysql.com/Downloads/MySQL-8.4/$MYSQL_PKG.tar.xz"
  MYSQL_TAR="$NATIVE_DIR/downloads/$MYSQL_PKG.tar.xz"
  # 새 버전이 나오면 이 URL 은 사라진다 → MYSQL_VERSION 과 docker-compose.yml 태그를 함께 올릴 것
  curl -fL -C - "$MYSQL_URL" -o "$MYSQL_TAR" || [ -s "$MYSQL_TAR" ]
  echo "$(curl -fsL "$MYSQL_URL.md5" | awk '{print $1}')  $MYSQL_TAR" | md5sum -c -
  # 테스트 스위트, 디버그 빌드 등 실행에 필요 없는 것은 풀지 않는다
  tar -xJf "$MYSQL_TAR" -C "$NATIVE_DIR" \
    --exclude='*/mysql-test' --exclude='*/bin/mysqld-debug' --exclude='*/lib/plugin/debug' \
    --exclude='*/docs' --exclude='*/man' --exclude='*/include'
  ln -sfn "$NATIVE_DIR/$MYSQL_PKG" "$MYSQL_BASE"
  rm -f "$MYSQL_TAR"
fi

# 문자셋/타임존은 Docker 와 같은 server/.db/etc/mysqld.cnf 를 include
cat >"$MYSQL_CNF" <<EOF
[mysqld]
user=root
basedir=$MYSQL_BASE
datadir=$MYSQL_DATA
socket=$MYSQL_SOCK
pid-file=$NATIVE_DIR/run/mysqld.pid
log-error=$NATIVE_DIR/log/mysqld.err
port=$DB_PORT
bind-address=127.0.0.1
mysqlx=OFF
max_connections=1000
host_cache_size=0
skip-name-resolve

[client]
socket=$MYSQL_SOCK
port=$DB_PORT

!include $ROOT_DIR/server/.db/etc/mysqld.cnf
EOF

sql_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/''/g"
}
DB_USER_SQL="$(sql_escape "$DB_USER")"
DB_PSWORD_SQL="$(sql_escape "$DB_PSWORD")"

if [ ! -d "$MYSQL_DATA/mysql" ]; then
  echo "==> MySQL 데이터 디렉터리 초기화"
  mysqld --defaults-file="$MYSQL_CNF" --initialize-insecure
  mysql_start
  mysql --defaults-file="$MYSQL_CNF" -uroot \
    -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '$DB_PSWORD_SQL';"
else
  mysql_start
fi

echo "==> DB 계정 / 테이블"
# skip-name-resolve 라 TCP(127.0.0.1) 접속은 'localhost' 계정과 매칭되지 않으므로 따로 만든다
if [ "$DB_USER" = "root" ]; then
  GRANT_SQL="GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;"
else
  GRANT_SQL="GRANT ALL PRIVILEGES ON \`$DB_DATABASE\`.* TO '$DB_USER_SQL'@'127.0.0.1';"
fi
mysql_root -e "
  CREATE USER IF NOT EXISTS '$DB_USER_SQL'@'127.0.0.1' IDENTIFIED BY '$DB_PSWORD_SQL';
  ALTER USER '$DB_USER_SQL'@'127.0.0.1' IDENTIFIED BY '$DB_PSWORD_SQL';
  $GRANT_SQL
  CREATE DATABASE IF NOT EXISTS \`$DB_DATABASE\`;"
mysql_root <"$ROOT_DIR/server/.db/initdb.d/create_table.sql"

if [ -n "$DUMP_FILE" ]; then
  echo "==> dump 복원: $DUMP_FILE"
  mysql_root --default-character-set=utf8mb4 <"$DUMP_FILE"
fi

echo "==> npm 의존성"
cd "$ROOT_DIR"
bash ./scripts/install-dependencies.sh

echo
echo "설치 완료. 실행: npm run start:native  /  종료: npm run exit:native"
