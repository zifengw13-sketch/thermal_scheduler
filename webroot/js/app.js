document.addEventListener('DOMContentLoaded', async () => {
    initSliders();
    initSaveButton();
    initNav();
    initOverclock();
    initSpoof();
    await loadSavedTargets();
    refreshData();
    setInterval(refreshData, 3000);
});

function initSliders() {
    const sliderMap = {
        'cpu-slider': 'cpu-val',
        'gpu-slider': 'gpu-val',
        'ddr-slider': 'ddr-val',
        'bat-slider': 'bat-val'
    };
    Object.entries(sliderMap).forEach(([sliderId, valId]) => {
        const slider = document.getElementById(sliderId);
        const valDisplay = document.getElementById(valId);
        if (slider && valDisplay) {
            slider.addEventListener('input', () => {
                valDisplay.textContent = slider.value + '°C';
            });
        }
    });
}

function initSaveButton() {
    const btn = document.getElementById('save-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        btn.textContent = '保存中...';
        btn.disabled = true;
        const channels = [
            { channel: 'CPU', slider: 'cpu-slider' },
            { channel: 'GPU', slider: 'gpu-slider' },
            { channel: 'DDR', slider: 'ddr-slider' },
            { channel: 'BAT', slider: 'bat-slider' }
        ];
        let allOk = true;
        for (const { channel, slider } of channels) {
            const value = document.getElementById(slider)?.value;
            if (value) {
                const ok = await saveTarget(channel, parseInt(value, 10));
                if (!ok) allOk = false;
            }
        }
        btn.textContent = allOk ? '✓ 已保存' : '✗ 保存失败';
        setTimeout(() => {
            btn.textContent = '保存设置';
            btn.disabled = false;
        }, 2000);
    });
}

const tabPanels = {
    'status': 'realtime-panel',
    'config': 'control-panel',
    'overclock': 'overclock-panel',
    'spoof': 'spoof-panel',
    'log': 'log-panel'
};

function initNav() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            Object.entries(tabPanels).forEach(([key, panelId]) => {
                const panel = document.getElementById(panelId);
                if (panel) panel.style.display = (key === tab) ? '' : 'none';
            });
        });
    });
}

async function loadSavedTargets() {
    const targets = await loadTargets();
    const map = { CPU: 'cpu', GPU: 'gpu', DDR: 'ddr', BAT: 'bat' };
    Object.entries(map).forEach(([ch, prefix]) => {
        if (targets[ch]) {
            const slider = document.getElementById(prefix + '-slider');
            const display = document.getElementById(prefix + '-val');
            if (slider) slider.value = targets[ch];
            if (display) display.textContent = targets[ch] + '°C';
        }
    });
}

async function refreshData() {
    const [cpuTemp, gpuTemp, batTemp, cpuFreq, guardStatus, realTemp, log] =
        await Promise.all([
            readTemp('cpu'), readTemp('gpu'), readTemp('battery'),
            readCpuFreq(), checkGuardStatus(), readRealTemp(), readLog()
        ]);

    document.getElementById('val-cpu-temp').textContent = cpuTemp ? cpuTemp + '°C' : '--';
    document.getElementById('val-gpu-temp').textContent = gpuTemp ? gpuTemp + '°C' : '--';
    document.getElementById('val-bat-temp').textContent = batTemp ? batTemp + '°C' : '--';
    document.getElementById('val-cpu-freq').textContent = cpuFreq ? cpuFreq + ' MHz' : '--';
    document.getElementById('val-guard-status').textContent = guardStatus || '--';
    document.getElementById('val-real-temp').textContent = realTemp ? realTemp + '°C' : '--';
    document.getElementById('log-content').textContent = log || '暂无日志';
}

function initOverclock() {
    document.querySelector('[data-tab="overclock"]').addEventListener('click', async () => {
        const bigFreqs = await getAvailableFreqs(0);
        const littleFreqs = await getAvailableFreqs(4);

        const bigSelect = document.getElementById('big-freq-select');
        bigSelect.innerHTML = '<option value="0">默认（不超频）</option>';
        bigFreqs.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = (f / 1000).toFixed(0) + ' MHz';
            bigSelect.appendChild(opt);
        });

        const littleSelect = document.getElementById('little-freq-select');
        littleSelect.innerHTML = '<option value="0">默认（不超频）</option>';
        littleFreqs.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = (f / 1000).toFixed(0) + ' MHz';
            littleSelect.appendChild(opt);
        });
    });

    const voltSlider = document.getElementById('volt-slider');
    voltSlider.addEventListener('input', () => {
        document.getElementById('volt-val').textContent = voltSlider.value + ' mV';
    });

    document.getElementById('oc-apply-btn').addEventListener('click', async () => {
        const btn = document.getElementById('oc-apply-btn');
        btn.textContent = '应用中...';
        btn.disabled = true;

        const config = {
            bigMax: parseInt(document.getElementById('big-freq-select').value, 10),
            littleMax: parseInt(document.getElementById('little-freq-select').value, 10),
            cpuVolt: parseInt(document.getElementById('volt-slider').value, 10)
        };
        const ok = await saveOverclock(config);
        btn.textContent = ok ? '✓ 已应用，请重启' : '✗ 应用失败';
        setTimeout(() => {
            btn.textContent = '应用超频配置';
            btn.disabled = false;
        }, 3000);
    });
}

function initSpoof() {
    const select = document.getElementById('device-template-select');
    const customDiv = document.getElementById('custom-props');

    select.addEventListener('change', () => {
        customDiv.style.display = (select.value === 'custom') ? '' : 'none';
    });

    document.getElementById('spoof-apply-btn').addEventListener('click', async () => {
        const btn = document.getElementById('spoof-apply-btn');
        btn.textContent = '应用中...';
        btn.disabled = true;

        const template = select.value;
        const customProps = document.getElementById('custom-props-input')?.value;
        if (!template) {
            btn.textContent = '请先选择模板';
            setTimeout(() => {
                btn.textContent = '应用机型伪装';
                btn.disabled = false;
            }, 2000);
            return;
        }

        const ok = await applyDeviceSpoof(template, customProps);
        btn.textContent = ok ? '✓ 已应用，请重启' : '✗ 应用失败';
        setTimeout(() => {
            btn.textContent = '应用机型伪装';
            btn.disabled = false;
        }, 3000);
    });
}