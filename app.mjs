import miio from 'miio';
import _ from 'lodash';
import axios from 'axios';
import * as db from './db.mjs';
import moment from 'moment';
import SunCalc from 'suncalc';

let config = {
    airPurifierIP: '192.168.0.2',
    forceTurnOn: false,
    overridePurifierMode: true,
    ifTurnedOnOverridePurifierMode: true,
    disableLed: false,
    purifierUpdateFrequency: 15,
    databaseLogging: true,
    lowerLoggingFrequency: true,

    enableNightMode: true,
    disableLedAtNight: true,
    criticalPM25Display: 25,
    criticalLevelDisplay: true,
    locationBased: false,
    dayStart: "6:30",
    dayEnd: "22:30",

    enableAirly: true,
    airlyUpdateFrequency: 60,
    airlyApiKey: "",
    latitude: "50.1",
    longitude: "20.0",

    unconditionalBoost: false,
    unconditionalBoostLevel: 0,

    preventLowTemperature: true,
    preventLowTemperatureThreshold: 25.0,
    preventLowTemperatureSpeed: 0,

    dayEnableCoolingDown: true,
    dayCoolingDownThreshold: 26.5,
    dayTempBetweenLevels: 0.6,
    preventHighTemperature: true,
    preventHighTemperatureMultiplier: 20,

    nightEnableCoolingDown: true,
    nightCoolingDownThreshold: 27.0,
    nightTempBetweenLevels: 0.4,

    preventLowHumidity: true,
    lowHumidityThreshold: 30,
    criticalHumidityThreshold: 24,

    minSpeed: 0,
    maxSpeed: 14,
};

let debug = {}, device = {}, dayLevels = [], nightLevels = [], purifier, night, times;

generateDayLevels(5, 59);
generateNightLevels(0, 48);

getData();
setInterval(() => getData(), config.purifierUpdateFrequency * 1000);

if (config.enableAirly) {
    getAirlyData();
    setInterval(() => getAirlyData(), config.airlyUpdateFrequency * 1000);
}

async function generateDayLevels(lowPollution, highPollution) {
    let pollutionRange = (highPollution - lowPollution);

    let low = {
        range: pollutionRange * (35 / 100),
        levels: 5,
        lowLevel: 0,
        maxLevel: function () {
            return low.lowLevel + low.levels;
        },
        low: lowPollution,
        high: function () {
            return low.low + low.range;
        },
        speed: function () {
            return low.range / low.levels;
        },
    };

    let mid = {
        range: pollutionRange * (50 / 100),
        levels: 6,
        lowLevel: low.maxLevel(),
        maxLevel: function () {
            return mid.lowLevel + mid.levels;
        },
        low: low.high(),
        high: function () {
            return mid.low + mid.range;
        },
        speed: function () {
            return mid.range / mid.levels;
        },
    };

    let high = {
        range: pollutionRange * (15 / 100),
        levels: 3,
        lowLevel: mid.maxLevel(),
        maxLevel: function () {
            return high.lowLevel + high.levels;
        },
        low: mid.high(),
        high: function () {
            return high.low + high.range;
        },
        speed: function () {
            return high.range / high.levels;
        },
    };

    for (let i = 0; i <= low.levels; ++i) {
        dayLevels.push({pm25: (i * low.speed()) + low.low, level: i + low.lowLevel});
    }

    for (let i = 1; i <= mid.levels; ++i) {
        dayLevels.push({pm25: (i * mid.speed()) + mid.low, level: i + mid.lowLevel})
    }

    for (let i = 1; i <= high.levels; ++i) {
        dayLevels.push({pm25: (i * high.speed()) + high.low, level: i + high.lowLevel})
    }

    dayLevels.reverse();
}

async function generateNightLevels(lowPollution, highPollution) {
    let pollutionRange = (highPollution - lowPollution);

    let low = {
        range: pollutionRange,
        levels: 8, //maxSpeed - minSpeed
        lowLevel: 0,
        maxLevel: function () {
            return low.lowLevel + low.levels;
        },
        low: lowPollution,
        high: function () {
            return low.low + low.range;
        },
        speed: function () {
            return low.range / low.levels;
        },
    };

    for (let i = 0; i <= low.levels; ++i) {
        nightLevels.push({pm25: (i * low.speed()) + low.low, level: i + low.lowLevel});
    }

    nightLevels.reverse();
}

function printer(str, element){
    if(element)
        return " " + str + ": " + element;
    return "";
}

async function prettyPrint(debug) {
    let log = "";
    log += printer("time", debug.time);
    log += printer("pm2.5", debug.pm25);
    log += printer("level", debug.level);
    log += printer("humidity", debug.humidity);
    log += printer("temperature", debug.temperature);
    log += printer("mode", debug.mode);
    log += printer("sunriseEnd", debug.sunriseEnd);
    log += printer("night", debug.night);
    log += printer("nightMode", debug.nightMode);
    log += printer("disableLedAtNight", debug.disableLedAtNight);
    log += printer("criticalLevelDisplay", debug.criticalLevelDisplay);
    log += printer("unconditionalBoostLevel", debug.unconditionalBoostLevel);
    log += printer("overridePurifierMode", debug.overridePurifierMode);
    log += printer("ifTurnedOnOverridePurifierMode", debug.ifTurnedOnOverridePurifierMode);
    log += printer("preventHighTemperature", debug.preventHighTemperature);
    log += printer("dayEnableCoolingDownSpeed", debug.dayEnableCoolingDownSpeed);
    log += printer("preventLowHumidity", debug.preventLowHumidity);
    log += printer("preventLowTemperature", debug.preventLowTemperature);
    log += printer("criticalHumidityThreshold", debug.criticalHumidityThreshold);
    console.log("{" + log + "}");
}

async function connectDevice() {
    purifier = await miio.device({address: config.airPurifierIP});
    device.pm25 = await purifier.pm2_5();
    device.temperature = (await purifier.temperature()).value.toFixed(1);
    device.humidity = await purifier.relativeHumidity();
    device.level = await purifier.favoriteLevel();
    device.led = await purifier.led();
    device.power = await purifier.power();
    device.mode = await purifier.mode();
}

async function checkForNight() {
    times = SunCalc.getTimes(new Date(), config.latitude, config.longitude);
    if (!config.locationBased) {
        night = !moment().isBetween(new moment(config.dayStart, "HH:mm"), new moment(config.dayEnd, "HH:mm"));
    } else {
        config.dayStart = new moment(times.sunriseEnd.getHours() + ':' + times.sunriseEnd.getMinutes(), "HH:mm");
        config.dayEnd = isNaN(times.night) ? new moment("23:59", "HH:mm") : new moment(times.night.getHours() + ':' + times.night.getMinutes(), "HH:mm");
        night = !moment().isBetween(config.dayStart, config.dayEnd);
    }
}

async function getData() {
    let newLevel = 0;

    const date = new Date();
    await checkForNight();
    await connectDevice();

    device.power ? debug.mode = device.mode : debug.power = device.power;
    debug.time = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit', hour12: false});
    debug.pm25 = device.pm25.toLocaleString([], {minimumIntegerDigits: 3});
    debug.humidity = device.humidity;
    debug.temperature = device.temperature;

    if (night && config.enableNightMode) {
        debug.nightMode = night;
        for (let key in nightLevels) {
            if (device.pm25 >= nightLevels[key].pm25) {
                newLevel = nightLevels[key].level;
                break;
            }
        }
        if (config.nightEnableCoolingDown && (device.temperature >= config.nightCoolingDownThreshold)) {
            let temperatureDifference = device.temperature - config.nightCoolingDownThreshold;
            let speed = Math.floor(1 + (temperatureDifference / config.nightTempBetweenLevels));
            newLevel += speed;
            debug.nightEnableCoolingDownSpeed = speed;
        }
        if (config.disableLedAtNight && device.led) {
            if (device.pm25 >= config.criticalPM25Display && config.criticalLevelDisplay) {
                await purifier.led(1);
                debug.criticalLevelDisplay = config.criticalLevelDisplay;
            } else {
                await purifier.led(0);
                debug.disableLedAtNight = config.disableLedAtNight;
            }
        }
    } else {
        for (let key in dayLevels) {
            if (device.pm25 >= dayLevels[key].pm25) {
                newLevel = dayLevels[key].level;
                break;
            }
        }
        if (config.dayEnableCoolingDown && (device.temperature >= config.dayCoolingDownThreshold)) {
            let temperatureDifference = device.temperature - config.dayCoolingDownThreshold;
            let speed = Math.floor(1 + (temperatureDifference / config.dayTempBetweenLevels));
            newLevel += speed;
            if (speed > config.preventHighTemperatureMultiplier) {
                await purifier.buzzer(1);
                await purifier.buzzer(0);
                debug.preventHighTemperature = config.preventHighTemperature;
                debug.dayEnableCoolingDownSpeed = speed;
            } else {
                debug.dayEnableCoolingDownSpeed = speed;
            }
        }
        if (config.disableLedAtNight && device.led != true) {
            await purifier.led(1);
        }
    }

    if (config.unconditionalBoost) {
        newLevel += config.unconditionalBoostLevel;
        debug.unconditionalBoostLevel = config.unconditionalBoostLevel;
    }

    if (config.preventLowHumidity && (device.humidity <= config.lowHumidityThreshold) && newLevel >= 1) {
        newLevel -= 1;
        debug.preventLowHumidity = config.preventLowHumidity;
    }

    if (config.preventLowTemperature && (device.temperature <= config.preventLowTemperatureThreshold)) {
        newLevel = config.preventLowTemperatureSpeed;
        debug.preventLowTemperature = config.preventLowTemperature;
    }

    if (config.preventLowHumidity && (device.humidity <= config.criticalHumidityThreshold)) {
        newLevel = 0;
        debug.criticalHumidityThreshold = config.preventLowHumidity;
    }

    if (config.forceTurnOn && !device.power) {
        await purifier.power(1);
        purifier.power = await purifier.power();
    }

    if ((config.overridePurifierMode && device.mode != 'favorite') || config.ifTurnedOnOverridePurifierMode && device.power) {
        try {
            await purifier.mode('favorite');
            device.mode = await purifier.mode();
            config.overridePurifierMode ? debug.overridePurifierMode = config.overridePurifierMode : debug.ifTurnedOnOverridePurifierMode = config.ifTurnedOnOverridePurifierMode;
        } catch (e) {
            console.log(e);
        }
    }

    if (device.mode == 'favorite') {
        if (device.level != newLevel) {
            try {
                await purifier.setFavoriteLevel(newLevel);
            } catch (e) {
                console.log(e);
            }
        }
    }
    debug.level = newLevel;
    await prettyPrint(debug);

    if (config.lowerLoggingFrequency && config.databaseLogging) {
        let humidity = device.humidity, pm25 = device.pm25, mode = device.mode, level = device.level,
            temperature = device.temperature;
        let data = {date, temperature: temperature, humidity, pm25, mode, level: level};
        try {
            await db.Air.create(data);
        } catch (e) {
            console.log("Database insert error");
        }
        config.owerLoggingFrequency = false;
    } else {
        config.lowerLoggingFrequency = true;
    }

    purifier.destroy();
}

async function getAirlyData() {
    try {
        let airlyData = await axios.get(
            "https://airapi.airly.eu/v2/measurements/point?" + "lat=" + config.latitude.toString() + "&lng=" + config.longitude.toString(),
            {headers: {'apikey': config.airlyApiKey}, timeout: 1500},
        );
        try {
            let fromDateTime = new Date(airlyData.data.current.fromDateTime);
            let tillDateTime = new Date(airlyData.data.current.fromDateTime);

            let values = airlyData.data.current.values;

            const date = new Date();

            const temperature = _.find(values, {name: 'TEMPERATURE'}).value;
            const humidity = _.find(values, {name: 'HUMIDITY'}).value;
            const pressure = _.find(values, {name: 'PRESSURE'}).value;
            const pm25 = _.find(values, {name: 'PM25'}).value;
            const pm10 = _.find(values, {name: 'PM10'}).value;
            const pm1 = _.find(values, {name: 'PM1'}).value;

            let data = {date, temperature, humidity, pressure, pm25, pm10, pm1};

            if (config.databaseLogging) {
                try {
                    await db.Airly.create(data);
                } catch (e) {
                    console.log("Database insert error");
                }
            }
        } catch (e) {
            console.log("Airly parsing error");
        }
    } catch (e) {
        console.log("Airly Timeout");
    }
}