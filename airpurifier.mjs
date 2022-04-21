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

    return purifier;
}

export async function getDeviceData(purifier) {
    purifier.power ? purifier.state.mode = purifier.mode : purifier.state.power = purifier.power;
    purifier.state.deviceId = purifier.id;
    purifier.state.pm25 = purifier.pm25.toLocaleString([], {minimumIntegerDigits: 3});
    purifier.state.humidity = purifier.humidity;
    purifier.state.temperature = purifier.temperature;
}