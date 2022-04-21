import _ from "lodash";
import * as db from "./db.mjs";

async function fetchWithTimeout(resource, options = {}) {
    const {timeout = 1500} = options;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, {
        ...options,
        signal: controller.signal
    });
    clearTimeout(id);
    return response;
}

export async function getAirlyData(logToDatabase, airlyApiKey, latitude, longitude) {
    try {
        const airlyResponse = await fetchWithTimeout("https://airapi.airly.eu/v2/measurements/point?" + "lat=" + latitude.toString() + "&lng=" + longitude.toString(), {
            method: 'GET',
            headers: {
                'apikey': airlyApiKey
            }
        })
        const airlyData = await airlyResponse.json();
        try {
            let fromDateTime = new Date(airlyData.current.fromDateTime);
            let tillDateTime = new Date(airlyData.current.fromDateTime);

            let values = airlyData.current.values;

            const date = new Date();

            const temperature = _.find(values, {name: 'TEMPERATURE'}).value;
            const humidity = _.find(values, {name: 'HUMIDITY'}).value;
            const pressure = _.find(values, {name: 'PRESSURE'}).value;
            const pm25 = _.find(values, {name: 'PM25'}).value;
            const pm10 = _.find(values, {name: 'PM10'}).value;
            const pm1 = _.find(values, {name: 'PM1'}).value;

            let data = {date, temperature, humidity, pressure, pm25, pm10, pm1};

            if (logToDatabase) {
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