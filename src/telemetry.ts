import TelemetryDeck from '@telemetrydeck/sdk';

const getDeviceId = () => {
    let deviceId = localStorage.getItem('td_device_id');
    if (!deviceId) {
        deviceId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem('td_device_id', deviceId);
    }
    return deviceId;
};

const td = new TelemetryDeck({
    appID: 'BCAC984C-9FFF-47DD-96FD-367CE083FBCD',
    clientUser: getDeviceId(),
});

export const trackTelemetryDeckEvent = (eventName: string) => {
    try {
        td.signal(eventName);
    } catch (error) {
        console.error('TelemetryDeck Error:', error);
    }
};

export const goatCounterEvent = (path: string, event: boolean = false) => {
    try {
        if ((window as any).goatcounter && (window as any).goatcounter.count) {
            (window as any).goatcounter.count({
                path: path,
                event: event
            });
        }
    } catch (error) {
        console.error('GoatCounter Error:', error);
    }
};

export const simpleAnalyticsEvent = (eventName: string, metadata?: any) => {
    try {
        if ((window as any).sa_event) {
            (window as any).sa_event(eventName, metadata);
        }
    } catch (error) {
        console.error('SimpleAnalytics Error:', error);
    }
};

export const trackUmamiEvent = (eventName: string, metadata?: any) => {
    try {
        if ((window as any).umami && (window as any).umami.track) {
            (window as any).umami.track(eventName, metadata);
        }
    } catch (error) {
        console.error('UmamiEvent Error:', error);
    }
};
