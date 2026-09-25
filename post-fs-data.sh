#!/system/bin/sh
# post-fs-data.sh — 早期启动脚本
MODDIR=${0%/*}
BACKUP_DIR="/data/local/tmp/thermal_scheduler/backup"
mkdir -p "$BACKUP_DIR"

# 备份原始配置
[ -f "$MODDIR/config/targets.conf" ] && \
    cp "$MODDIR/config/targets.conf" "$BACKUP_DIR/targets.conf.bak"
[ -f "$MODDIR/config/overclock.conf" ] && \
    cp "$MODDIR/config/overclock.conf" "$BACKUP_DIR/overclock.conf.bak"