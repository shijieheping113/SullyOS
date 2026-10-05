import React from 'react';
import { BatteryCharging } from '@phosphor-icons/react';
import { canReadBattery } from '../../utils/batteryReminder';

/** 跟天气感知同一张卡片的骨架，颜色用暖琥珀，避免和天气的绿色糊在一起。 */
const BatteryReminderSettingsCard: React.FC<{
    enabled: boolean;
    onChange: (enabled: boolean) => void;
}> = ({ enabled, onChange }) => {
    const supported = canReadBattery();
    return (
        <div className="bg-amber-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <BatteryCharging size={20} weight="fill" className="text-amber-600 shrink-0" />
                    <span className="text-sm font-bold text-amber-800">手机电量</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={e => onChange(e.target.checked)}
                        className="sr-only peer"
                        aria-label="手机电量提醒"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
                </label>
            </div>
            <p className="text-[10px] text-amber-900/70 leading-relaxed">
                插上电、低于 20%、充满的时候，最近聊过的角色说一句，屏幕顶上弹一张卡，这句话也留在聊天里。这个开关马上生效，不用点下面的保存。
            </p>
            {!supported && (
                <p className="text-[10px] text-amber-800/80 leading-relaxed">你的设备不支持。</p>
            )}
        </div>
    );
};

export default BatteryReminderSettingsCard;
