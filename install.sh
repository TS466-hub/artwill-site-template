#!/usr/bin/env bash
# Установка сайта-шаблона с админ-панелью на сервер (Ubuntu 22.04/24.04, Debian 12) одной командой:
#
#   curl -fsSL https://raw.githubusercontent.com/TS466-hub/artwill-site-template/main/install.sh | sudo bash -s -- ivan
#
# «ivan» — имя сайта: получится https://ivan.artwillkrd.ru. Можно указать и полный домен: … -- site.example.ru
# Повторный запуск безопасен: код обновится, уже созданные сайты не тронутся.
# Следующие сайты на этом же сервере создаются короче:  sitectl add maria
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/TS466-hub/artwill-site-template.git}
BRANCH=${BRANCH:-main}
APP=/opt/site-template

say()  { printf '\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Запустите от root: … | sudo bash -s -- имя-сайта"
command -v apt-get >/dev/null || die "Нужен Ubuntu или Debian"
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1   # без вопросов и длинных списков о перезапуске служб

say "→ 1/5 Системные пакеты"
# Подкачка 1 ГБ — страховка для сервера с 1 ГБ памяти
if ! swapon --show | grep -q .; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
apt-get update -qq
apt-get install -y -qq git nginx certbot python3-certbot-nginx curl ca-certificates openssl ufw >/dev/null

say "→ 2/5 Node.js"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

# Корневой сертификат Минцифры — нужен для уведомлений в MAX
if [ ! -f /usr/local/share/ca-certificates/russian_trusted_root_ca.crt ]; then
  curl -fsSL https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt -o /usr/local/share/ca-certificates/russian_trusted_root_ca.crt \
    && update-ca-certificates >/dev/null 2>&1 || echo "⚠ Не удалось скачать сертификат Минцифры — уведомления в MAX могут не работать"
fi

say "→ 3/5 Код шаблона"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q origin "$BRANCH" && git -C "$APP" checkout -q "$BRANCH" && git -C "$APP" reset -q --hard "origin/$BRANCH"
else
  git clone -q --depth 1 -b "$BRANCH" "$REPO_URL" "$APP"
fi
(cd "$APP/server" && npm ci --omit=dev --no-audit --no-fund --loglevel=error >/dev/null)
chmod +x "$APP/sitectl"
ln -sf "$APP/sitectl" /usr/local/bin/sitectl

say "→ 4/5 Службы"
id sites >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin sites
mkdir -p /srv/sites /var/www/sites /etc/site-template
chmod 755 /srv/sites /var/www/sites
install -m 644 "$APP/deploy/site@.service" /etc/systemd/system/site@.service
mkdir -p /etc/nginx/snippets
install -m 644 "$APP/deploy/site-security.conf" /etc/nginx/snippets/site-security.conf
# Сертификаты для сайтов, у которых DNS заработал позже, — автоматически
install -m 644 "$APP/deploy/cron" /etc/cron.d/site-template
rm -f /etc/nginx/sites-enabled/default
# Неизвестные адреса — пустой ответ, а не первый попавшийся сайт
cat > /etc/nginx/sites-available/000-default.conf <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}
NGINX
ln -sf /etc/nginx/sites-available/000-default.conf /etc/nginx/sites-enabled/000-default.conf
nginx -t -q && systemctl reload nginx
systemctl daemon-reload
# Файрвол: SSH (на каком бы порту он ни был) + веб. Если файрвол уже настроен — только добавляем веб
for p in $(ss -Htlnp 2>/dev/null | awk '/sshd/ {n=split($4,a,":"); print a[n]}' | sort -u); do ufw allow "$p/tcp" >/dev/null; done
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw status | grep -q 'Status: active' || ufw --force enable >/dev/null

# Сайты, созданные раньше, — пересобрать на новом коде
for f in /srv/sites/*/site.env; do
  [ -f "$f" ] || continue
  sitectl update >/dev/null 2>&1 || true
  break
done

say "→ 5/5 Сайт"
if [ -n "${1:-}" ]; then
  sitectl add "$@"
else
  echo "Код установлен. Создайте сайт:  sitectl add имя-сайта"
fi
