function printer(str, element) {
    return (element || element == 0) ? " " + str + ": " + element : "";
}

export async function prettyPrint(debug) {
    let log = "";
    let parameters = {
        "device": "deviceId",
        "time": "time",
        "pm2.5": "pm25",
        "level": "level",
        "humidity": "humidity",
        "temperature": "temperature",
        "mode": "mode",
        "sunriseEnd": "sunriseEnd",
        "night": "night",
        "nightMode": "nightMode",
        "disableLedAtNight": "disableLedAtNight",
        "criticalLevelDisplay": "criticalLevelDisplay",
        "unconditionalBoostLevel": "unconditionalBoostLevel",
        "overridePurifierMode": "overridePurifierMode",
        "hysteresis": "hysteresis",
        "advancedHysteresisUp": "advancedHysteresisUp",
        "advancedHysteresisDown": "advancedHysteresisDown",
        "ifTurnedOnOverridePurifierMode": "ifTurnedOnOverridePurifierMode",
        "preventHighTemperature": "preventHighTemperature",
        "dayEnableCoolingDownSpeed": "dayEnableCoolingDownSpeed",
        "preventLowHumidity": "preventLowHumidity",
        "preventLowTemperature": "preventLowTemperature",
        "criticalHumidityThreshold": "criticalHumidityThreshold",
    };
    let k = Object.keys(parameters);
    let v = Object.values(parameters);
    for (let i = 0; i < k.length; ++i) {
        log += printer(k[i], debug[v[i]]);
    }

    console.log("{" + log + "}");
}