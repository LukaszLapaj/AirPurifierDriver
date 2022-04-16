export async function generateDaySpeedLevels(lowPollution, highPollution) {
    let levels = [];
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
        levels.push({pm25: (i * low.speed()) + low.low, level: i + low.lowLevel});
    }

    for (let i = 1; i <= mid.levels; ++i) {
        levels.push({pm25: (i * mid.speed()) + mid.low, level: i + mid.lowLevel})
    }

    for (let i = 1; i <= high.levels; ++i) {
        levels.push({pm25: (i * high.speed()) + high.low, level: i + high.lowLevel})
    }

    levels.reverse();
    return levels;
}

export async function generateNightSpeedLevels(lowPollution, highPollution) {
    let levels = [];
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
        levels.push({pm25: (i * low.speed()) + low.low, level: i + low.lowLevel});
    }

    levels.reverse();
    return levels;
}