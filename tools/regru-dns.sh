#!/usr/bin/env bash
# Записи DNS для поддоменов через API REG.RU — запускать на СВОЁМ компьютере (не на сервере ученика).
#
#   ./tools/regru-dns.sh wildcard 1.2.3.4     *.artwillkrd.ru → 1.2.3.4 (один раз для общего сервера)
#   ./tools/regru-dns.sh add ivan 1.2.3.4     ivan.artwillkrd.ru → 1.2.3.4 (сайт на отдельном сервере)
#   ./tools/regru-dns.sh remove ivan 1.2.3.4  удалить запись
#   ./tools/regru-dns.sh list                 показать записи зоны
#
# Перед первым запуском в REG.RU: Личный кабинет → Настройки → «Настройки API»:
#   1) задайте альтернативный пароль для API;  2) добавьте IP вашего компьютера в список разрешённых.
# Логин и пароль спрашиваются при запуске (или REGRU_USER / REGRU_PASS в окружении) и никуда не сохраняются.
set -euo pipefail
ZONE=${ZONE:-artwillkrd.ru}
API=https://api.reg.ru/api/regru2

die() { echo "✗ $*" >&2; exit 1; }
[ -n "${REGRU_USER:-}" ] || read -r -p "Логин REG.RU: " REGRU_USER
[ -n "${REGRU_PASS:-}" ] || { read -r -s -p "Пароль API REG.RU: " REGRU_PASS; echo; }

call() { # $1 = метод, $2 = JSON с параметрами
  local data
  data=$(python3 -c 'import json,sys; d=json.loads(sys.argv[3]); d.update(username=sys.argv[1], password=sys.argv[2], domains=[{"dname": sys.argv[4]}], output_content_type="plain"); print(json.dumps(d))' "$REGRU_USER" "$REGRU_PASS" "$2" "$ZONE")
  local out
  out=$(curl -sS --max-time 30 "$API/$1" --data-urlencode "input_data=$data" -d input_format=json)
  python3 -c 'import json,sys
r=json.loads(sys.argv[1])
if r.get("result")!="success": print("✗", r.get("error_text") or r.get("error_code") or r); sys.exit(1)
for d in r.get("answer",{}).get("domains",[]):
  if d.get("result")!="success": print("✗", d.get("error_text") or d); sys.exit(1)
  for rr in d.get("rrs",[]) or []: print("%-6s %-24s %s" % (rr.get("rectype"), rr.get("subname"), rr.get("content")))
print("✓ готово")' "$out"
}

ip_ok() { printf '%s' "$1" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$' || die "Неверный IP: $1"; }
name_ok() { printf '%s' "$1" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' || die "Неверное имя: $1"; }

case "${1:-}" in
  wildcard) ip_ok "${2:-}"; call zone/add_alias "{\"subdomain\":\"*\",\"ipaddr\":\"$2\"}" ;;
  add)      name_ok "${2:-}"; ip_ok "${3:-}"; call zone/add_alias "{\"subdomain\":\"$2\",\"ipaddr\":\"$3\"}" ;;
  remove)   name_ok "${2:-}"; ip_ok "${3:-}"; call zone/remove_record "{\"subdomain\":\"$2\",\"record_type\":\"A\",\"content\":\"$3\"}" ;;
  list)     call zone/get_resource_records '{}' ;;
  *) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
