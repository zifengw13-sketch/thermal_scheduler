#!/system/bin/sh
# service.sh — 开机启动脚本

MODDIR=${0%/*}

# 等待系统完全启动
until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 1
done

sleep 5

# 创建运行时目录
mkdir -p /data/local/tmp/thermal_scheduler
LOG="/data/local/tmp/thermal_scheduler/service.log"

echo "$(date): 服务启动" >> "$LOG"

# 超频看门狗：检查上一次超频是否导致启动失败
OC_FLAG="/data/local/tmp/thermal_scheduler/oc_pending"
if [ -f "$OC_FLAG" ]; then
    # 如果这个标记文件存在，说明上次超频后系统可能没有正常启动
    BOOT_COUNT=$(cat "$OC_FLAG" 2>/dev/null || echo 0)
    if [ "$BOOT_COUNT" -ge 1 ]; then
        echo "$(date): 检测到超频启动失败，正在回滚" >> "$LOG"
        # 回滚超频配置
        OC_CONFIG="$MODDIR/config/overclock.conf"
        [ -f "$OC_CONFIG" ] && {
            sed -i 's/^BIG_MAX=.*/BIG_MAX=0/' "$OC_CONFIG"
            sed -i 's/^LITTLE_MAX=.*/LITTLE_MAX=0/' "$OC_CONFIG"
            sed -i 's/^GPU_MAX=.*/GPU_MAX=0/' "$OC_CONFIG"
        }
        rm -f "$OC_FLAG"
    else
        echo "1" > "$OC_FLAG"
    fi
fi

# 启动温度伪装守护进程
if [ -f "$MODDIR/bin/thermal_guard" ]; then
    chmod 755 "$MODDIR/bin/thermal_guard"
    "$MODDIR/bin/thermal_guard" >> "$LOG" 2>&1 &
    GUARD_PID=$!
    echo "$(date): thermal_guard 已启动 PID=$GUARD_PID" >> "$LOG"
fi

# 启动调度管理脚本
if [ -f "$MODDIR/sched_manager.sh" ]; then
    chmod 755 "$MODDIR/sched_manager.sh"
    "$MODDIR/sched_manager.sh" >> "$LOG" 2>&1 &
    SCHED_PID=$!
    echo "$(date): sched_manager 已启动 PID=$SCHED_PID" >> "$LOG"
fi

# 应用机型伪装
if [ -f "$MODDIR/apply_spoof.sh" ]; then
    chmod 755 "$MODDIR/apply_spoof.sh"
    "$MODDIR/apply_spoof.sh" >> "$LOG" 2>&1
fi

# 写入 PID 供 WebUI 查询
echo "$GUARD_PID" > /data/local/tmp/thermal_scheduler/guard.pid
echo "$SCHED_PID" > /data/local/tmp/thermal_scheduler/sched.pid

echo "$(date): 所有服务已启动" >> "$LOG"