# Docker 없이 실행 (루팅폰 arm64 등). 최초 1회 bash scripts/setup-native.sh 필요.
# MySQL 기동 → 서버 빌드 → 클라이언트 정적 빌드 → pm2 로 서버 + 클라이언트 실행
set -euo pipefail
source "$(dirname "$0")/native-env.sh"
cd "$ROOT_DIR"

mysql_start

rm -rf server/app/build
npm run build --prefix server/app
npx env-cmd -f config/.client.env npm run build --prefix client/app

pm2 delete "$SERVER_PM2_NAME" "$CLIENT_PM2_NAME" >/dev/null 2>&1 || true
# DB_HOST=127.0.0.1 등 native-env.sh 에서 export 한 값이 그대로 서버 프로세스로 넘어간다
(cd server/app && pm2 start build/main.js --name "$SERVER_PM2_NAME")
pm2 serve client/app/build "$CLIENT_PORT" --spa --name "$CLIENT_PM2_NAME"
pm2 list
