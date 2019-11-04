import miio from 'miio';
import _ from 'lodash';
import axios from 'axios';
import * as db from './db.mjs';
import moment from 'moment';
import SunCalc from 'suncalc';

let purifier = {
    ip: '192.168.0.222',
};

const config = {
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

    enableHysteresis: true,
    advancedHysteresis: true,
    hysteresisLevel: 2,

    minSpeed: 0,
    maxSpeed: 14,
};

let debug = {}, dayLevels = [], nightLevels = [], hysteresisStack = [], night, times;
let logState = true;

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

function printer(str, element) {
    if (element || element == 0)
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
    log += printer("hysteresis", debug.hysteresis);
    log += printer("advancedHysteresis", debug.advancedHysteresis);
    log += printer("advancedHysteresisUp", debug.advancedHysteresisUp);
    log += printer("advancedHysteresisDown", debug.advancedHysteresisDown);
    log += printer("ifTurnedOnOverridePurifierMode", debug.ifTurnedOnOverridePurifierMode);
    log += printer("preventHighTemperature", debug.preventHighTemperature);
    log += printer("dayEnableCoolingDownSpeed", debug.dayEnableCoolingDownSpeed);
    log += printer("preventLowHumidity", debug.preventLowHumidity);
    log += printer("preventLowTemperature", debug.preventLowTemperature);
    log += printer("criticalHumidityThreshold", debug.criticalHumidityThreshold);
    console.log("{" + log + "}");
}

async function connectDevice() {
    purifier.device = await miio.device({address: purifier.ip});
    purifier.pm25 = await purifier.device.pm2_5();
    purifier.temperature = (await purifier.device.temperature()).value.toFixed(1);
    purifier.humidity = await purifier.device.relativeHumidity();
    purifier.level = await purifier.device.favoriteLevel();
    purifier.led = await purifier.device.led();
    purifier.power = await purifier.device.power();
    purifier.mode = await purifier.device.mode();
    // purifier.device.destroy();
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

async function saveLevel(nextLevel) {
    let l = config.hysteresisLevel + 1;
    hysteresisStack[hysteresisStack.length] = nextLevel;

    if (hysteresisStack.length > l) {
        hysteresisStack = hysteresisStack.slice(hysteresisStack.length - l, hysteresisStack.length);
    }
}

async function hysteresis(nextLevel) {
    await saveLevel(nextLevel);

    debug.advancedHysteresisUp = null;
    debug.advancedHysteresisDown = null;

    let length = hysteresisStack.length;
    if (length < config.hysteresisLevel + 1) {
        return hysteresisStack[length - 1];
    }

    let currDiff = hysteresisStack[length - 2] - hysteresisStack[length - 1];
    let absCurrDiff = Math.abs(currDiff);

    let test = true;
    for (let i = config.hysteresisLevel; i > 1; --i) {
        test = (hysteresisStack[length - i] == hysteresisStack[length - i - 1]) && test;
        if (!test) {
            break;
        }
    }
    debug.hysteresis = test;

    if (test && absCurrDiff < 2) {
        return hysteresisStack[length - 2];
    }

    if (test && config.advancedHysteresis && absCurrDiff >= 4) {
        let currentHysteresis = Math.floor(absCurrDiff / 2);
        let lastLevel = hysteresisStack[length - 2];
        if (absCurrDiff > currDiff) {
            debug.advancedHysteresisUp = (lastLevel + currentHysteresis);
            return (lastLevel + currentHysteresis);
        } else {
            debug.advancedHysteresisDown = (lastLevel - currentHysteresis);
            return (lastLevel - currentHysteresis);
        }
    }

    return hysteresisStack[length - 1];
}

async function getData() {
    let nextLevel = 0;

    const date = new Date();
    await checkForNight();
    await connectDevice();

    purifier.power ? debug.mode = purifier.mode : debug.power = purifier.power;
    debug.time = date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});
    debug.pm25 = purifier.pm25.toLocaleString([], {minimumIntegerDigits: 3});
    debug.humidity = purifier.humidity;
    debug.temperature = purifier.temperature;

    if (night && config.enableNightMode) {
        debug.nightMode = night;
        for (let key in nightLevels) {
            if (purifier.pm25 >= nightLevels[key].pm25) {
                nextLevel = nightLevels[key].level;
                break;
            }
        }
        if (config.nightEnableCoolingDown && (purifier.temperature >= config.nightCoolingDownThreshold)) {
            let temperatureDifference = purifier.temperature - config.nightCoolingDownThreshold;
            let speed = Math.floor(1 + (temperatureDifference / config.nightTempBetweenLevels));
            nextLevel += speed;
            debug.nightEnableCoolingDownSpeed = speed;
        }
        if (config.disableLedAtNight && purifier.led) {
            if (purifier.pm25 >= config.criticalPM25Display && config.criticalLevelDisplay) {
                await purifier.device.led(1);
                debug.criticalLevelDisplay = config.criticalLevelDisplay;
            } else {
                await purifier.device.led(0);
                debug.disableLedAtNight = config.disableLedAtNight;
            }
        }
    } else {
        for (let key in dayLevels) {
            if (purifier.pm25 >= dayLevels[key].pm25) {
                nextLevel = dayLevels[key].level;
                break;
            }
        }
        if (config.dayEnableCoolingDown && (purifier.temperature >= config.dayCoolingDownThreshold)) {
            let temperatureDifference = purifier.temperature - config.dayCoolingDownThreshold;
            let speed = Math.floor(1 + (temperatureDifference / config.dayTempBetweenLevels));
            nextLevel += speed;
            if (speed > config.preventHighTemperatureMultiplier) {
                await purifier.device.buzzer(1);
                await purifier.device.buzzer(0);
                debug.preventHighTemperature = config.preventHighTemperature;
                debug.dayEnableCoolingDownSpeed = speed;
            } else {
                debug.dayEnableCoolingDownSpeed = speed;
            }
        }
        if (config.disableLedAtNight && purifier.led != true) {
            await purifier.device.led(1);
        }
    }

    nextLevel = await hysteresis(nextLevel);

    if (config.unconditionalBoost) {
        nextLevel += config.unconditionalBoostLevel;
        debug.unconditionalBoostLevel = config.unconditionalBoostLevel;
    }

    if (config.preventLowHumidity && (purifier.humidity <= config.lowHumidityThreshold) && nextLevel >= 1) {
        nextLevel -= 1;
        debug.preventLowHumidity = config.preventLowHumidity;
    }

    if (config.preventLowTemperature && (purifier.temperature <= config.preventLowTemperatureThreshold)) {
        nextLevel = config.preventLowTemperatureSpeed;
        debug.preventLowTemperature = config.preventLowTemperature;
    }

    if (config.preventLowHumidity && (purifier.humidity <= config.criticalHumidityThreshold)) {
        nextLevel = 0;
        debug.criticalHumidityThreshold = config.preventLowHumidity;
    }

    if (config.forceTurnOn && !purifier.power) {
        await purifier.device.power(1);
        purifier.device.power = await purifier.device.power();
    }

    if ((config.overridePurifierMode && purifier.mode != 'favorite') || config.ifTurnedOnOverridePurifierMode && purifier.power) {
        try {
            await purifier.device.mode('favorite');
            purifier.mode = await purifier.device.mode();
            config.overridePurifierMode ? debug.overridePurifierMode = config.overridePurifierMode : debug.ifTurnedOnOverridePurifierMode = config.ifTurnedOnOverridePurifierMode;
        } catch (e) {
            console.log(e);
        }
    }

    debug.level = nextLevel;
    await prettyPrint(debug);

    if (purifier.mode == 'favorite') {
        if (purifier.level != nextLevel) {
            try {
                await purifier.device.setFavoriteLevel(nextLevel);
            } catch (e) {
                console.log(e);
            }
        }
    }

    if (config.databaseLogging) {
        let humidity = purifier.humidity, pm25 = purifier.pm25, mode = purifier.mode, level = purifier.level,
            temperature = purifier.temperature;
        let data = {date, temperature: temperature, humidity, pm25, mode, level: level};
        try {
            await db.Air.create(data);
        } catch (e) {
            console.log("Database insert error");
        }
        logState = !(config.lowerLoggingFrequency && logState == true);
    }
    purifier.device.destroy();
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