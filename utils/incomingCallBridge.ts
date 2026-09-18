import type { IncomingCallState } from './incomingCall';

export interface IncomingCallRequest {
    charId: string;
    charName: string;
    charAvatar?: string;
    line: string;
    messageId?: number;
    popupStyle: IncomingCallState['popupStyle'];
    ringtone?: IncomingCallState['ringtone'];
    amsgReplay?: boolean;
}

export interface IncomingCallHooks {
    canOffer: (req: IncomingCallRequest) => boolean | Promise<boolean>;
    offer: (req: IncomingCallRequest) => void;
}

let hooks: IncomingCallHooks | null = null;

export const setIncomingCallHooks = (next: IncomingCallHooks | null) => {
    hooks = next;
};

export const canOfferIncomingCallNow = async (req: IncomingCallRequest): Promise<boolean> => {
    if (!hooks) return false;
    try {
        return !!(await hooks.canOffer(req));
    } catch {
        return false;
    }
};

export const offerIncomingCall = (req: IncomingCallRequest): void => {
    try {
        hooks?.offer(req);
    } catch (e) {
        console.warn('[IncomingCall] offer failed:', e);
    }
};
