async function saveLevel(purifier, nextLevel, hysteresisLevel) {
    let expectedStackLength = hysteresisLevel + 1;
    let hysteresisStack = purifier.hysteresisStack;

    hysteresisStack[hysteresisStack.length] = nextLevel;
    let currentStackLength = hysteresisStack.length;

    if (currentStackLength > expectedStackLength) {
        purifier.hysteresisStack = hysteresisStack.slice(currentStackLength - expectedStackLength, currentStackLength);
    }
}

export async function hysteresis(nextLevel, purifier, config) {
    purifier.state.advancedHysteresisUp = null;
    purifier.state.advancedHysteresisDown = null;

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
    purifier.state.hysteresis = testForHysteresis;

    if (testForHysteresis && absCurrentLevelDifference < 2) {
        return hysteresisStack[currentStackLength - 2];
    }

    if (testForHysteresis && config.advancedHysteresis && absCurrentLevelDifference > 3) {
        let levelCorrection = Math.floor(absCurrentLevelDifference / 2);
        let lastLevel = hysteresisStack[currentStackLength - 2];
        if (absCurrentLevelDifference > currentLevelDifference) {
            purifier.state.advancedHysteresisUp = (lastLevel + levelCorrection);
            return (lastLevel + levelCorrection);
        } else {
            purifier.state.advancedHysteresisDown = (lastLevel - levelCorrection);
            return (lastLevel - levelCorrection);
        }
    }

    return hysteresisStack[currentStackLength - 1];
}

export async function determineNextSpeedLevel(purifier, config, dayLevels, nightLevels, isNight) {
    let nextLevel = 0;
    if (isNight && config.enableNightMode) {
        purifier.state.nightMode = isNight;
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
            purifier.state.nightEnableCoolingDownSpeed = speed;
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
                purifier.state.preventHighTemperature = config.preventHighTemperature;
                purifier.state.dayEnableCoolingDownSpeed = speed;
            } else {
                purifier.state.dayEnableCoolingDownSpeed = speed;
            }
        }
    }

    nextLevel = await hysteresis(nextLevel, purifier, config);

    if (config.unconditionalBoost) {
        nextLevel += config.unconditionalBoostLevel;
        purifier.state.unconditionalBoostLevel = config.unconditionalBoostLevel;
    }

    if (config.preventLowHumidity && (purifier.humidity <= config.lowHumidityThreshold) && nextLevel >= 1) {
        nextLevel -= 1;
        purifier.state.preventLowHumidity = config.preventLowHumidity;
    }

    if (config.preventLowTemperature && (purifier.temperature <= config.preventLowTemperatureThreshold)) {
        nextLevel = config.preventLowTemperatureSpeed;
        purifier.state.preventLowTemperature = config.preventLowTemperature;
    }

    if (config.preventLowHumidity && (purifier.humidity <= config.criticalHumidityThreshold)) {
        nextLevel = 0;
        purifier.state.criticalHumidityThreshold = config.preventLowHumidity;
    }

    return nextLevel;
}