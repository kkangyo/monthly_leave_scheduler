# start-native.sh 로 띄운 서버/클라이언트(pm2)와 MySQL 종료
source "$(dirname "$0")/native-env.sh"

pm2 delete "$SERVER_PM2_NAME" "$CLIENT_PM2_NAME" 2>/dev/null || true
mysql_stop
