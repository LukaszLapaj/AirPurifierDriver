import SunCalc from "suncalc";
import moment from "moment";

export async function checkForNight(config) {
    let night, times;
    times = SunCalc.getTimes(new Date(), config.latitude, config.longitude);
    if (!config.locationBased) {
        night = !moment().isBetween(new moment(config.dayStart, "HH:mm"), new moment(config.dayEnd, "HH:mm"));
    } else {
        config.dayStart = new moment(times.sunriseEnd.getHours() + ':' + times.sunriseEnd.getMinutes(), "HH:mm");
        config.dayEnd = isNaN(times.night) ? new moment("23:59", "HH:mm") : new moment(times.night.getHours() + ':' + times.night.getMinutes(), "HH:mm");
        night = !moment().isBetween(config.dayStart, config.dayEnd);
    }
    return night;
}