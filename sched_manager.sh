#!/system/bin/sh
# sched_manager.sh — 调度管理脚本
# 读取真实温度（由 thermal_guard 写入），根据温度动态调整频率

MODDIR="${0%/*}"
CONFIG="$MODDIR/config/sched.conf"
REAL_TEMP_FILE="/data/local/tmp/thermal_scheduler/real_temp"

# 默认参数
CPU_MAX_PERF=0
GPU_MAX_PERF=0
GOVERNOR="schedutil"

if [ -f "$CONFIG" ]; then
    . "$CONFIG"
fi

get_cpu_count() {
    ls /sys/devices/system/cpu/ | grep -c "^cpu[0-9]"
}

set_cpu_max_freq() {
    local freq=$1
    local cpu_count=$(get_cpu_count)
    local i=0

    while [ $i -lt $cpu_count ]; do
        local policy_dir="/sys/devices/system/cpu/cpufreq/policy$i"
        if [ -d "$policy_dir" ]; then
            if [ "$freq" -eq 0 ]; then
                local max_freq=$(cat "$policy_dir/cpuinfo_max_freq" 2>/dev/null)
                [ -n "$max_freq" ] && echo "$max_freq" > "$policy_dir/scaling_max_freq" 2>/dev/null
            else
                echo "$freq" > "$policy_dir/scaling_max_freq" 2>/dev/null
            fi
        fi
        i=$((i + 1))
    done
}

set_governor() {
    local gov=$1
    local cpu_count=$(get_cpu_count)
    local i=0

    while [ $i -lt $cpu_count ]; do
        local policy_dir="/sys/devices/system/cpu/cpufreq/policy$i"
        if [ -d "$policy_dir" ]; then
            echo "$gov" > "$policy_dir/scaling_governor" 2>/dev/null
        fi
        i=$((i + 1))
    done
}

# 读取真实温度
get_real_temp() {
    if [ -f "$REAL_TEMP_FILE" ]; then
        cat "$REAL_TEMP_FILE" 2>/dev/null
    else
        echo 0
    fi
}

# 超频安全监控
check_overclock_safety() {
    local OC_CONFIG="$MODDIR/config/overclock.conf"
    [ -f "$OC_CONFIG" ] || return 0

    local rollback_temp=$(grep "^THERMAL_ROLLBACK_TEMP=" "$OC_CONFIG" 2>/dev/null | cut -d= -f2)
    [ -z "$rollback_temp" ] && rollback_temp=85000

    local soc_temp=$(get_real_temp)

    if [ "$soc_temp" -gt "$rollback_temp" ] 2>/dev/null; then
        echo "[sched_manager] 超频温度保护触发: $((soc_temp/1000))°C"
        set_cpu_max_freq 0
        sed -i 's/^BIG_MAX=.*/BIG_MAX=0/' "$OC_CONFIG"
        sed -i 's/^LITTLE_MAX=.*/LITTLE_MAX=0/' "$OC_CONFIG"
        sed -i 's/^GPU_MAX=.*/GPU_MAX=0/' "$OC_CONFIG"
    fi
}

echo "[sched_manager] 调度管理脚本已启动"

while true; do
    soc_temp=$(get_real_temp)

    if [ "$soc_temp" -gt 80000 ]; then
        set_cpu_max_freq 1200000
        set_governor powersave
    elif [ "$soc_temp" -gt 65000 ]; then
        set_cpu_max_freq 1800000
        set_governor schedutil
    else
        set_cpu_max_freq 0
        set_governor schedutil
    fi

    check_overclock_safety
    sleep 10
done