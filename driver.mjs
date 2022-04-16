async function saveLevel(purifier, nextLevel, hysteresisLevel) {
    let expectedStackLength = hysteresisLevel + 1;
    let hysteresisStack = purifier.hysteresisStack;

    hysteresisStack[hysteresisStack.length] = nextLevel;
    let currentStackLength = hysteresisStack.length;

    if (currentStackLength > expectedStackLength) {
        purifier.hysteresisStack = hysteresisStack.slice(currentStackLength - expectedStackLength, currentStackLength);
    }
}

export async function hysteresis(nextLevel, debug, purifier, config) {
    debug.advancedHysteresisUp = null;
    debug.advancedHysteresisDown = null;

    await saveLevel(purifier, nextLevel);

    let hysteresisStack = purifier.hysteresisStack;
    let currentStackLength = hysteresisStack.length;
    let expectedStackLength = config.hysteresisLevel + 1;

    if (currentStackLength < expectedStackLength) {
        return hysteresisStack[currentStackLength - 1];
    }

    let currentLevelDifference = hysteresisStack[currentStackLength - 2] - hysteresisStack[currentStackLength - 1];
    let absCurrentLevelDifference = Math.abs(currentLevelDifference);

    let testForHysteresis = true;
    for (let i = config.hysteresisLevel; i > 1; --i) {
        let position = currentStackLength - i;
        testForHysteresis = (hysteresisStack[position] === hysteresisStack[position - 1]) && testForHysteresis;
        if (!testForHysteresis) {
            break;
        }
    }
    debug.hysteresis = testForHysteresis;

    if (testForHysteresis && absCurrentLevelDifference < 2) {
        return hysteresisStack[currentStackLength - 2];
    }

    if (testForHysteresis && config.advancedHysteresis && absCurrentLevelDifference > 3) {
        let levelCorrection = Math.floor(absCurrentLevelDifference / 2);
        let lastLevel = hysteresisStack[currentStackLength - 2];
        if (absCurrentLevelDifference > currentLevelDifference) {
            debug.advancedHysteresisUp = (lastLevel + levelCorrection);
            return (lastLevel + levelCorrection);
        } else {
            debug.advancedHysteresisDown = (lastLevel - levelCorrection);
            return (lastLevel - levelCorrection);
        }
    }

    return hysteresisStack[currentStackLength - 1];
}

export async function determineNextSpeedLevel(debug, purifier, config, dayLevels, nightLevels, isNight) {
    let nextLevel = 0;
    if (isNight && config.enableNightMode) {
        debug.nightMode = isNight;
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
    }

    nextLevel = await hysteresis(nextLevel, debug, purifier, config);

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

    return nextLevel;
}