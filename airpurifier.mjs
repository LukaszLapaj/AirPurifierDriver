import miio from "miio";

export async function connectDevice(purifier) {
    try {
        purifier.device = await miio.device({address: purifier.ip, token: purifier.token});
        purifier.pm25 = await purifier.device.pm2_5();
        purifier.temperature = (await purifier.device.temperature()).value.toFixed(1);
        purifier.humidity = await purifier.device.relativeHumidity();
        purifier.level = await purifier.device.favoriteLevel();
        purifier.led = await purifier.device.led();
        purifier.power = await purifier.device.power();
        purifier.mode = await purifier.device.mode();
    } catch (e) {
        console.log("Unable to connect device: " + purifier.id);
    }
}

export function getDeviceData(purifier, debug) {
    purifier.power ? debug.mode = purifier.mode : debug.power = purifier.power;
    debug.deviceId = purifier.id;
    debug.pm25 = purifier.pm25.toLocaleString([], {minimumIntegerDigits: 3});
    debug.humidity = purifier.humidity;
    debug.temperature = purifier.temperature;
}