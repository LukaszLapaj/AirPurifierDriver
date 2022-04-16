import SunCalc from "suncalc";
import moment from "moment";

export async function checkForNight(isLocationBased, dayStart, dayEnd, latitude, longitude) {
    let isNight
    let times = SunCalc.getTimes(new Date(), latitude, longitude);
    if (!isLocationBased) {
        isNight = !moment().isBetween(new moment(dayStart, "HH:mm"), new moment(dayEnd, "HH:mm"));
    } else {
        dayStart = new moment(times.sunriseEnd.getHours() + ':' + times.sunriseEnd.getMinutes(), "HH:mm");
        dayEnd = isNaN(times.night) ? new moment("23:59", "HH:mm") : new moment(times.night.getHours() + ':' + times.night.getMinutes(), "HH:mm");
        isNight = !moment().isBetween(dayStart, dayEnd);
    }
    return isNight;
}
