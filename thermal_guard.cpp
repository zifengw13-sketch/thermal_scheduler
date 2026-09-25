// thermal_guard.cpp
// 伪删温控守护进程 — 扫描温度节点并伪装温度值
// 同时记录真实温度供调度脚本读取

#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <dirent.h>
#include <unistd.h>
#include <cstring>
#include <signal.h>
#include <sys/stat.h>
#include <ctime>

// 配置结构体：每个通道的目标温度
struct ChannelConfig {
    std::string name;      // 通道名称: CPU, GPU, DDR, BAT
    std::string keyword;   // 用于匹配 type 文件的关键词
    int target_temp;       // 目标伪装温度 (单位: 0.001°C)
    bool enabled;          // 是否启用
};

// 全局配置数组
ChannelConfig channels[] = {
    {"CPU",  "cpu",   40000, true},
    {"GPU",  "gpu",   40000, true},
    {"DDR",  "ddr",   40000, true},
    {"BAT",  "battery", 34000, true}
};

const int CHANNEL_COUNT = 4;
const std::string THERMAL_PATH = "/sys/class/thermal/";
const std::string CONFIG_PATH = "/data/adb/modules/thermal_scheduler/config/targets.conf";
const std::string REAL_TEMP_PATH = "/data/local/tmp/thermal_scheduler/real_temp";
const std::string LOG_PATH = "/data/local/tmp/thermal_scheduler/guard.log";

// 读取文件内容的辅助函数
std::string readFile(const std::string& path) {
    std::ifstream f(path);
    if (!f.is_open()) return "";
    std::string content;
    std::getline(f, content);
    return content;
}

// 写入文件的辅助函数
bool writeFile(const std::string& path, const std::string& value) {
    std::ofstream f(path);
    if (!f.is_open()) return false;
    f << value;
    return true;
}

// 写日志
void log(const std::string& msg) {
    std::ofstream f(LOG_PATH, std::ios::app);
    if (!f.is_open()) return;
    time_t now = time(nullptr);
    char buf[64];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", localtime(&now));
    f << "[" << buf << "] " << msg << std::endl;
}

// 从配置文件加载目标温度
void loadConfig() {
    std::ifstream f(CONFIG_PATH);
    if (!f.is_open()) return;

    std::string line;
    while (std::getline(f, line)) {
        if (line.empty() || line[0] == '#') continue;

        size_t pos = line.find('=');
        if (pos == std::string::npos) continue;

        std::string key = line.substr(0, pos);
        std::string val = line.substr(pos + 1);

        for (int i = 0; i < CHANNEL_COUNT; i++) {
            if (key == channels[i].name) {
                try {
                    channels[i].target_temp = std::stoi(val);
                } catch (...) {}
                break;
            }
        }
    }
}

// 扫描并伪装所有 thermal_zone
// 同时把真实温度写入 REAL_TEMP_PATH 供调度脚本读取
void scanAndSpoof() {
    DIR* dir = opendir(THERMAL_PATH.c_str());
    if (!dir) {
        log("无法打开 " + THERMAL_PATH);
        return;
    }

    // 用于汇总真实温度
    int cpuTempSum = 0, cpuTempCount = 0;

    struct dirent* entry;
    while ((entry = readdir(dir)) != nullptr) {
        std::string name = entry->d_name;
        if (name.find("thermal_zone") != 0) continue;

        std::string zonePath = THERMAL_PATH + name + "/";
        std::string typePath = zonePath + "type";
        std::string tempPath = zonePath + "temp";

        std::string type = readFile(typePath);
        if (type.empty()) continue;

        std::string typeLower = type;
        for (auto& c : typeLower) c = tolower(c);

        // 读取真实温度
        std::string realTempStr = readFile(tempPath);
        int realTemp = 0;
        try { realTemp = std::stoi(realTempStr); } catch (...) {}

        // 匹配通道
        for (int i = 0; i < CHANNEL_COUNT; i++) {
            if (!channels[i].enabled) continue;

            if (typeLower.find(channels[i].keyword) != std::string::npos) {
                // 累加 CPU 真实温度用于调度
                if (channels[i].name == "CPU" && realTemp > 0) {
                    cpuTempSum += realTemp;
                    cpuTempCount++;
                }

                // 写入伪装温度
                std::string fakeTemp = std::to_string(channels[i].target_temp);
                writeFile(tempPath, fakeTemp);
                break;
            }
        }
    }
    closedir(dir);

    // 写入真实 CPU 平均温度
    if (cpuTempCount > 0) {
        int avgTemp = cpuTempSum / cpuTempCount;
        writeFile(REAL_TEMP_PATH, std::to_string(avgTemp));
    }
}

// 信号处理
volatile bool running = true;
void signalHandler(int sig) {
    running = false;
}

int main() {
    signal(SIGTERM, signalHandler);
    signal(SIGINT, signalHandler);

    // 确保目录存在
    mkdir("/data/local/tmp/thermal_scheduler", 0755);

    log("守护进程已启动");

    loadConfig();

    int round = 0;
    while (running) {
        if (round % 10 == 0) {
            loadConfig();
        }

        scanAndSpoof();
        round++;
        sleep(3);
    }

    log("守护进程已停止");
    return 0;
}