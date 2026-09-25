// bridge.js — 与 KernelSU/Magisk 系统通信的桥接层

function isKsuAvailable() {
    return typeof ksu !== 'undefined' && typeof ksu.exec === 'function';
}

async function execCmd(cmd) {
    if (!isKsuAvailable()) {
        console.warn('[bridge] KernelSU 不可用');
        return '';
    }
    try {
        const result = await ksu.exec(cmd);
        return result.stdout || '';
    } catch (e) {
        console.error('[bridge] 命令执行失败:', cmd, e);
        return '';
    }
}

async function readTemp(keyword) {
    const cmd = `for zone in /sys/class/thermal/thermal_zone*/; do
        type=$(cat "$zone/type" 2>/dev/null | tr 'A-Z' 'a-z')
        case "$type" in
            *${keyword}*)
                temp=$(cat "$zone/temp" 2>/dev/null)
                [ -n "$temp" ] && echo "$temp" && break
                ;;
        esac
    done`;
    const output = await execCmd(cmd);
    const raw = parseInt(output.trim(), 10);
    if (isNaN(raw)) return null;
    return (raw / 1000).toFixed(1);
}

async function readCpuFreq() {
    const output = await execCmd('cat /sys/devices/system/cpu/cpufreq/policy0/scaling_cur_freq 2>/dev/null');
    const khz = parseInt(output.trim(), 10);
    if (isNaN(khz)) return null;
    return (khz / 1000).toFixed(0);
}

async function readRealTemp() {
    const output = await execCmd('cat /data/local/tmp/thermal_scheduler/real_temp 2>/dev/null');
    const raw = parseInt(output.trim(), 10);
    if (isNaN(raw)) return null;
    return (raw / 1000).toFixed(1);
}

async function checkGuardStatus() {
    const cmd = `if [ -f /data/local/tmp/thermal_scheduler/guard.pid ]; then
        pid=$(cat /data/local/tmp/thermal_scheduler/guard.pid)
        if kill -0 "$pid" 2>/dev/null; then echo "运行中"; else echo "已停止"; fi
    else echo "未启动"; fi`;
    return (await execCmd(cmd)).trim();
}

async function readLog() {
    return await execCmd('cat /data/local/tmp/thermal_scheduler/service.log 2>/dev/null | tail -30');
}

async function saveTarget(channel, value) {
    const rawValue = value * 1000;
    const cmd = `CONFIG="/data/adb/modules/thermal_scheduler/config/targets.conf"
        [ -f "$CONFIG" ] || touch "$CONFIG"
        sed -i "/^${channel}=/d" "$CONFIG"
        echo "${channel}=${rawValue}" >> "$CONFIG"
        echo OK`;
    return (await execCmd(cmd)).includes('OK');
}

async function loadTargets() {
    const output = await execCmd('cat /data/adb/modules/thermal_scheduler/config/targets.conf 2>/dev/null');
    const targets = {};
    output.split('\n').forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) targets[key] = parseInt(val, 10) / 1000;
    });
    return targets;
}

async function getAvailableFreqs(policyIndex) {
    const output = await execCmd(`cat /sys/devices/system/cpu/cpufreq/policy${policyIndex}/available_frequencies 2>/dev/null`);
    if (!output.trim()) return [];
    return output.trim().split(/\s+/)
        .map(f => parseInt(f, 10))
        .filter(f => !isNaN(f))
        .sort((a, b) => b - a);
}

async function saveOverclock(config) {
    const lines = [
        `BIG_MAX=${config.bigMax || 0}`,
        `LITTLE_MAX=${config.littleMax || 0}`,
        `GPU_MAX=${config.gpuMax || 0}`,
        `CPU_VOLT_OFFSET=${config.cpuVolt || 0}`,
        `GPU_VOLT_OFFSET=${config.gpuVolt || 0}`,
        `THERMAL_ROLLBACK_TEMP=85000`
    ];
    const cmd = `cat > /data/adb/modules/thermal_scheduler/config/overclock.conf << 'EOF'
${lines.join('\n')}
EOF
touch /data/local/tmp/thermal_scheduler/oc_pending
echo OK`;
    return (await execCmd(cmd)).includes('OK');
}

async function applyDeviceSpoof(templateName, customProps) {
    let props = '';
    if (templateName === 'custom' && customProps) {
        props = customProps;
    } else {
        props = await execCmd(`cat /data/adb/modules/thermal_scheduler/config/device_templates/${templateName}.prop 2>/dev/null`);
    }
    const cmd = `cat > /data/adb/modules/thermal_scheduler/config/active_spoof.prop << 'EOF'
${props}
EOF
/data/adb/modules/thermal_scheduler/apply_spoof.sh
echo OK`;
    return (await execCmd(cmd)).includes('OK');
}