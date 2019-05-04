import miio from 'miio';
import _ from 'lodash';
import axios from 'axios';
import * as db from './db.mjs';

const airPurifierIP = '192.168.0.2';
const moment = require('moment');

const overridePurifierMode = true;
const purifierUpdateFrequency = 30;
const databaseLogging = true;
let lowerLoggingFrequency = true;

const enableNightMode = true;
const disableLedAtNight = true;
const dayStart = "6:30";
const dayEnd = "22:30";

const enableAirly = true;
const airlyUpdateFrequency = 90;
const airlyApiKey = "";
const latitude = "50.1";
const longitude = "20.0";

const unconditionalBoost = true;
const unconditionalBoostLevel = 1;

const preventLowTemperature = true;
const preventLowTemperatureThreshold = 25.0;
const preventLowTemperatureSpeed = 0;

const dayEnableCoolingDown = true;
const dayCoolingDownThreshold = 26.5;
const dayCoolingDownSpeed = 2;
const nightEnableCoolingDown = true;
const nightCoolingDownThreshold = 27.5;
const nightCoolingDownSpeed = 1;

const preventLowHumidity = true;
const lowHumidityThreshold = 30;
const criticalHumidityThreshold = 24;

getData();
setInterval(() => getData(), purifierUpdateFrequency * 1000);

if (enableAirly) {
    getAirlyData();
    setInterval(() => getAirlyData(), airlyUpdateFrequency * 1000);
}

const dayLevels = [
    {pm25: 70, level: 16},
    {pm25: 65, level: 15},
    {pm25: 60, level: 14},
    {pm25: 50, level: 13},
    {pm25: 46, level: 12},
    {pm25: 41, level: 11},
    {pm25: 40, level: 10},
    {pm25: 38, level: 9},
    {pm25: 35, level: 8},
    {pm25: 32, level: 7},
    {pm25: 28, level: 6},
    {pm25: 24, level: 5},
    {pm25: 18, level: 3},
    {pm25: 13, level: 2},
    {pm25: 9, level: 1},
    {pm25: 5, level: 0},
];

const nightLevels = [
    {pm25: 48, level: 8},
    {pm25: 42, level: 7},
    {pm25: 36, level: 6},
    {pm25: 30, level: 5},
    {pm25: 24, level: 3},
    {pm25: 18, level: 2},
    {pm25: 11, level: 1},
    {pm25: 8, level: 0},
];

async function getData() {
    const date = new Date();
    const device = await miio.device({address: airPurifierIP});
    const pm25 = await device.pm2_5();
    const temperature = await device.temperature();
    const humidity = await device.relativeHumidity();
    const level = await device.favoriteLevel();
    let mode = await device.mode();

    let newLevel = 0;

    let night = !moment().isBetween(new moment(dayStart, "HH:mm"), new moment(dayEnd, "HH:mm"));
    let debug = "time: " +  date.toLocaleTimeString() + " pm2.5: " + parseInt(pm25).toLocaleString('en-US', {minimumIntegerDigits: 3}) + " level: " + level + " humidity: " + humidity + " temperature: " + parseFloat(temperature).toFixed(1);

    if (night && enableNightMode) {
        debug += " night: " + night;
        for (let key in nightLevels) {
            if (pm25 >= nightLevels[key].pm25) {
                newLevel = nightLevels[key].level;
                break;
            }
        }
        if (nightEnableCoolingDown && (temperature.value >= nightCoolingDownThreshold) && 16 > newLevel + nightCoolingDownSpeed) {
            newLevel += nightCoolingDownSpeed;
            debug += " nightEnableCoolingDown: " + nightEnableCoolingDown;
        }
        if (disableLedAtNight) {
            await device.led(0);
            debug += " disableLedAtNight: " + disableLedAtNight;
        }
    } else {
        for (let key in dayLevels) {
            if (pm25 >= dayLevels[key].pm25) {
                newLevel = dayLevels[key].level;
                break;
            }
        }
        if (dayEnableCoolingDown && (temperature.value >= dayCoolingDownThreshold) && 16 > newLevel + dayCoolingDownSpeed) {
            newLevel += dayCoolingDownSpeed;
            debug += " dayEnableCoolingDown: " + dayEnableCoolingDown;
        }
        if (disableLedAtNight) {
            await device.led(1);
        }
    }

    if (unconditionalBoost) {
        newLevel += unconditionalBoostLevel;
        debug += " unconditionalBoostLevel: " + unconditionalBoostLevel;
    }

    if (preventLowHumidity && (humidity <= lowHumidityThreshold) && newLevel >= 1) {
        newLevel -= 1;
        debug += " preventLowHumidity: " + preventLowHumidity;
    }

    if (preventLowTemperature && (temperature.value <= preventLowTemperatureThreshold)) {
        newLevel = preventLowTemperatureSpeed;
        debug += " preventLowTemperature: " + preventLowTemperature;
    }

    if (preventLowHumidity && (humidity <= criticalHumidityThreshold)) {
        newLevel = 0;
        debug += " criticalHumidityThreshold: " + preventLowHumidity;
    }

    if (overridePurifierMode) {
        try {
            await device.mode('favorite');
            mode = await device.mode();
        } catch (e) {
            console.log(e);
        }
    }

    if (mode == 'favorite') {
        if (level != newLevel) {
            try {
                await device.setFavoriteLevel(newLevel);
            } catch (e) {
                console.log(e);
            }
        }
    }

    if (lowerLoggingFrequency && databaseLogging) {
        let data = {date, temperature: temperature.value, humidity, pm25, mode};
        data.level = level;
        try {
            await db.Air.create(data);
        } catch (e) {
            console.log("Database insert error");
        }
        lowerLoggingFrequency = false;
    } else {
        lowerLoggingFrequency = true;
    }

    console.log("{ " + debug  + " }");

    device.destroy();
}

async function getAirlyData() {
    try {
        let airlyData = await axios.get(
            "https://airapi.airly.eu/v2/measurements/point?" + "lat=" + latitude.toString() + "&lng=" + longitude.toString(),
            {headers: {'apikey': airlyApiKey}, timeout: 1500},
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

            if(databaseLogging) {
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