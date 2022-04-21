import {logData} from './db.mjs';

import config from "./config.json" assert {type: "json"};
import devices from "./devices.json" assert {type: "json"};
import {generateDaySpeedLevels, generateNightSpeedLevels} from "./speedLevelGenerators.mjs";
import {prettyPrint} from "./logger.mjs";
import {getAirlyData} from "./Airly.mjs";
import {connectDevice, getDeviceData} from "./airpurifier.mjs";
import {determineNextSpeedLevel} from "./driver.mjs";
import {checkForNight} from "./timeHelper.mjs";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

await init();

async function init() {
    const dayLevels = generateDaySpeedLevels(6, 60);
    const nightLevels = generateNightSpeedLevels(6, 54);

    for (let id = 0; id < devices.length; ++id) {
        devices[id].id = id;
        await getData(devices[id], dayLevels, nightLevels);
        setInterval(() => getData(devices[id]), config.purifierUpdateFrequency * 1000);
        await sleep(6000);
    }

    if (config.enableAirly) {
        await getAirlyData(config.databaseLogging, config.airlyApiKey, config.latitude, config.longitude);
        setInterval(async () => await getAirlyData(config.databaseLogging, config.airlyApiKey, config.latitude, config.longitude), config.airlyUpdateFrequency * 1000);
    }
}

async function getData(purifier, dayLevels, nightLevels) {
    purifier = await connectDevice(purifier);
    await getDeviceData(purifier);

    const date = new Date();
    let isNight = await checkForNight(config.locationBased, config.dayStart, config.dayEnd, config.latitude, config.longitude);

    purifier.state.time = date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});

    let nextLevel = await determineNextSpeedLevel(purifier, config, dayLevels, nightLevels, isNight);

    if (isNight && config.enableNightMode) {
        if (config.disableLedAtNight && purifier.led) {
            if (purifier.pm25 >= config.criticalPM25Display && config.criticalLevelDisplay) {
                await purifier.device.led(1);
                purifier.state.criticalLevelDisplay = config.criticalLevelDisplay;
            } else {
                await purifier.device.led(0);
                purifier.state.disableLedAtNight = config.disableLedAtNight;
            }
        }
    } else {
        if (config.disableLedAtNight && purifier.led != true) {
            await purifier.device.led(1);
        }
    }

    if (config.forceTurnOn && !purifier.power) {
        await purifier.device.power(1);
        purifier.device.power = await purifier.device.power();
    }

    if ((config.overridePurifierMode && purifier.mode != 'favorite') || config.ifTurnedOnOverridePurifierMode && purifier.power) {
        try {
            await purifier.device.mode('favorite');
            purifier.mode = await purifier.device.mode();
            config.overridePurifierMode ? purifier.state.overridePurifierMode = config.overridePurifierMode : purifier.state.ifTurnedOnOverridePurifierMode = config.ifTurnedOnOverridePurifierMode;
        } catch (e) {
            console.log(e);
        }
    }

    purifier.state.level = nextLevel;

    await prettyPrint(purifier.state);

    if (purifier.mode === 'favorite' & purifier.level != nextLevel) {
        try {
            await purifier.device.setFavoriteLevel(nextLevel);
        } catch (e) {
            console.log("Error setting device speed");
        }
    }

    if (config.databaseLogging && purifier.id === 0) {
        await logData(purifier, date);
    }
    purifier.device.destroy();
}