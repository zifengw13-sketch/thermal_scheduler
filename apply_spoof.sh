#!/system/bin/sh
# apply_spoof.sh — 应用机型伪装配置

MODDIR="${0%/*}"
SPOOF_CONFIG="$MODDIR/config/active_spoof.prop"
SYSTEM_PROP="$MODDIR/system.prop"

if [ ! -f "$SPOOF_CONFIG" ]; then
    echo "无激活的伪装配置"
    exit 0
fi

# 验证属性完整性
if ! grep -q "^ro.product.brand=" "$SPOOF_CONFIG" || \
   ! grep -q "^ro.product.model=" "$SPOOF_CONFIG"; then
    echo "错误: 伪装配置缺少 brand 或 model 属性"
    exit 1
fi

> "$SYSTEM_PROP"
while IFS= read -r line; do
    case "$line" in
        ''|\#*) continue ;;
    esac
    echo "$line" >> "$SYSTEM_PROP"
done < "$SPOOF_CONFIG"

echo "system.prop 已更新，共 $(wc -l < "$SYSTEM_PROP") 条属性"