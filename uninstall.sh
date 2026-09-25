#!/system/bin/sh
# uninstall.sh — 模块卸载清理

if [ -f /data/local/tmp/thermal_scheduler/guard.pid ]; then
    kill $(cat /data/local/tmp/thermal_scheduler/guard.pid) 2>/dev/null
fi
if [ -f /data/local/tmp/thermal_scheduler/sched.pid ]; then
    kill $(cat /data/local/tmp/thermal_scheduler/sched.pid) 2>/dev/null
fi

rm -rf /data/local/tmp/thermal_scheduler

for policy in /sys/devices/system/cpu/cpufreq/policy*/; do
    [ -d "$policy" ] || continue
    max_freq=$(cat "${policy}cpuinfo_max_freq" 2>/dev/null)
    [ -n "$max_freq" ] && echo "$max_freq" > "${policy}scaling_max_freq" 2>/dev/null
    echo "schedutil" > "${policy}scaling_governor" 2>/dev/null
done

echo "thermal_scheduler 模块已卸载"