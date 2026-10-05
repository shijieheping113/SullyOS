import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOS } from '../context/OSContext';
import { AppID } from '../types';
import BatteryReminderCard from './BatteryReminderCard';
import {
    canReadBattery,
    decideBatteryReminder,
    readBatteryLedger,
    readBatteryReminderEnabled,
    readBatterySample,
    writeBatteryLedger,
    writeBatterySample,
    type BatterySample,
} from '../utils/batteryReminder';
import { runBatteryReminder, type BatterySpeech } from '../utils/batteryReminderRun';

interface BatteryManager extends EventTarget {
    level: number;
    charging: boolean;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
}

/**
 * 平时靠电量变化喊一声；页面藏到后台就卸下监听；切回前台再补看一眼。
 * 说完的那句经 battery-reminder-show 排进卡片。
 */
const BatteryReminderHost: React.FC = () => {
    const {
        isDataLoaded, characters, userProfile, apiConfig, groups, realtimeConfig,
        openApp, setActiveCharacterId,
    } = useOS();
    const [card, setCard] = useState<BatterySpeech | null>(null);
    const cardRef = useRef<BatterySpeech | null>(null);
    const queueRef = useRef<BatterySpeech[]>([]);
    const bagRef = useRef({ characters, userProfile, apiConfig, groups, realtimeConfig });
    bagRef.current = { characters, userProfile, apiConfig, groups, realtimeConfig };
    const chainRef = useRef(Promise.resolve());

    const show = (speech: BatterySpeech) => {
        if (!speech?.text) return;
        if (cardRef.current) queueRef.current.push(speech);
        else {
            cardRef.current = speech;
            setCard(speech);
        }
    };

    const dismiss = () => {
        const next = queueRef.current.shift() || null;
        cardRef.current = next;
        setCard(next);
    };

    useEffect(() => {
        const onShow = (event: Event) => {
            show((event as CustomEvent<BatterySpeech>).detail);
        };
        window.addEventListener('battery-reminder-show', onShow);
        return () => window.removeEventListener('battery-reminder-show', onShow);
    }, []);

    useEffect(() => {
        if (!isDataLoaded) return;
        let stopped = false;
        let battery: BatteryManager | null = null;

        const runSample = (next: BatterySample) => {
            chainRef.current = chainRef.current.then(async () => {
                if (stopped) return;
                const prev = readBatterySample();
                if (!readBatteryReminderEnabled()) {
                    writeBatterySample(next);
                    return;
                }
                const decision = decideBatteryReminder(prev, next, readBatteryLedger());
                if (!decision.kind) {
                    writeBatterySample(next);
                    writeBatteryLedger(decision.ledger);
                    return;
                }
                const bag = bagRef.current;
                if (!bag.userProfile) {
                    writeBatterySample(next);
                    return;
                }
                const speech = await runBatteryReminder({
                    kind: decision.kind,
                    level: next.level,
                    characters: bag.characters,
                    userProfile: bag.userProfile,
                    apiConfig: bag.apiConfig,
                    groups: bag.groups || [],
                    realtimeConfig: bag.realtimeConfig,
                });
                writeBatterySample(next);
                if (speech) writeBatteryLedger(decision.ledger);
            }).catch((error) => {
                console.error('[电量提醒] 这一轮没走完', error);
            });
        };

        const pageHidden = () => document.visibilityState === 'hidden';

        const readNow = () => {
            if (!battery) return;
            runSample({
                level: Math.round(battery.level * 100),
                charging: !!battery.charging,
            });
        };

        const detach = () => {
            if (!battery) return;
            battery.removeEventListener('levelchange', readNow);
            battery.removeEventListener('chargingchange', readNow);
            battery = null;
        };

        const attach = async () => {
            if (stopped || battery || pageHidden() || !canReadBattery()) return;
            try {
                const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
                const nextBattery = await nav.getBattery?.();
                if (!nextBattery || stopped || pageHidden()) return;
                battery = nextBattery;
                battery.addEventListener('levelchange', readNow);
                battery.addEventListener('chargingchange', readNow);
                readNow();
            } catch (error) {
                console.error('[电量提醒] 读不到电量', error);
            }
        };

        const onVis = () => {
            if (document.visibilityState === 'hidden') detach();
            else void attach();
        };
        const onEnabled = () => {
            if (document.visibilityState !== 'hidden') readNow();
        };

        void attach();
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('battery-reminder-enabled-changed', onEnabled);
        return () => {
            stopped = true;
            detach();
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('battery-reminder-enabled-changed', onEnabled);
        };
    }, [isDataLoaded]);

    if (!card || typeof document === 'undefined') return null;

    return createPortal(
        <BatteryReminderCard
            speech={card}
            onDismiss={dismiss}
            onOpen={() => {
                setActiveCharacterId(card.charId);
                openApp(AppID.Chat);
                dismiss();
            }}
        />,
        document.body,
    );
};

export default BatteryReminderHost;
