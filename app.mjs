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
        await getAirlyData(config.databaseLogging);
        setInterval(() => getAirlyData(), config.airlyUpdateFrequency * 1000);
    }
}

async function getData(purifier, dayLevels, nightLevels) {
    let nextLevel = 0;
    let debug = {};

    const date = new Date();
    let isNight = await checkForNight(config);

    await connectDevice(purifier);
    getDeviceData(purifier, debug);

    debug.time = date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});

    nextLevel = await determineNextSpeedLevel(debug, purifier, nextLevel, config, dayLevels, nightLevels, isNight);
    debug.level = nextLevel;

    purifier.debug = debug;
    await prettyPrint(purifier.debug);

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

