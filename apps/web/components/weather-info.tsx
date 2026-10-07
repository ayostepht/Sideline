import { InfoPopover } from "./info-popover";
import { WEATHER_NOTE } from "./weather";

/** The single explanation, tap to open. */
export function WeatherInfo() {
  return <InfoPopover label="About weather" text={WEATHER_NOTE} testid="weather-info" />;
}
