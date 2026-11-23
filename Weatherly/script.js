const API = {
    geo: "https://geocoding-api.open-meteo.com/v1/search",
    weather: "https://api.open-meteo.com/v1/forecast"
};

const $ = (id) => document.getElementById(id);
const els = {
    form: $("searchForm"), input: $("cityInput"), location: $("locationBtn"),
    theme: $("themeBtn"), city: $("cityName"), temp: $("temperature"),
    description: $("description"), date: $("dateTime"), icon: $("weatherIcon"),
    feels: $("feelsLike"), humidity: $("humidity"), wind: $("wind"), pressure: $("pressure"),
    hourly: $("hourlyContainer"), forecast: $("forecastContainer"), history: $("historyList"),
    loading: $("loading"), error: $("error")
};

document.addEventListener("DOMContentLoaded", () => {
    loadTheme();
    displayHistory();
    getWeatherByCity("Harare");
});

els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const city = els.input.value.trim();
    if (!city) {
        els.input.focus();
        return;
    }
    getWeatherByCity(city);
    els.input.value = "";
});
els.location.addEventListener("click", getLocationWeather);
els.theme.addEventListener("click", toggleTheme);

async function getWeatherByCity(city) {
    setLoading(true);
    clearError();
    try {
        const url = new URL(API.geo);
        url.search = new URLSearchParams({ name: city, count: "1", language: "en", format: "json" });
        const response = await fetch(url);
        if (!response.ok) throw new Error("Location search is unavailable. Please try again.");
        const data = await response.json();
        if (!data.results?.length) throw new Error(`We couldn't find “${city}”. Check the spelling and try again.`);
        const place = data.results[0];
        await getWeather(place.latitude, place.longitude, [place.name, place.admin1, place.country].filter(Boolean).join(", "));
    } catch (err) {
        showError(err.message || "Something went wrong while searching.");
        setLoading(false);
    }
}

async function getWeather(latitude, longitude, city) {
    setLoading(true);
    clearError();
    try {
        const url = new URL(API.weather);
        url.search = new URLSearchParams({
            latitude, longitude,
            current: "temperature_2m,relative_humidity_2m,apparent_temperature,pressure_msl,wind_speed_10m,weather_code",
            hourly: "temperature_2m,weather_code",
            daily: "weather_code,temperature_2m_max,temperature_2m_min",
            timezone: "auto", forecast_days: "5"
        });
        const response = await fetch(url);
        if (!response.ok) throw new Error(response.status === 403
            ? "The weather service declined this request. Please try again in a moment."
            : "Weather data is temporarily unavailable. Please try again.");
        const data = await response.json();
        if (!data.current || !data.daily || !data.hourly) throw new Error("The weather service returned incomplete data.");
        displayCurrentWeather(data, city);
        saveSearch(city);
    } catch (err) {
        showError(err.message || "Unable to load weather right now.");
    } finally {
        setLoading(false);
    }
}

function displayCurrentWeather(data, city) {
    const current = data.current;
    els.city.textContent = city;
    els.temp.textContent = `${Math.round(current.temperature_2m)}°`;
    els.description.textContent = getWeatherDescription(current.weather_code);
    els.icon.className = getWeatherIcon(current.weather_code);
    els.feels.textContent = `${Math.round(current.apparent_temperature)}°`;
    els.humidity.textContent = `${current.relative_humidity_2m}%`;
    els.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    els.pressure.textContent = `${Math.round(current.pressure_msl)} hPa`;
    els.date.textContent = formatApiTime(current.time, data.timezone, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    changeBackground(current.weather_code);
    displayHourly(data.hourly, current.time, data.timezone);
    displayForecast(data.daily);
}

function getWeatherIcon(code) {
    if (code === 0) return "fa-solid fa-sun";
    if (code <= 2) return "fa-solid fa-cloud-sun";
    if (code === 3) return "fa-solid fa-cloud";
    if (code <= 48) return "fa-solid fa-smog";
    if (code <= 57) return "fa-solid fa-cloud-rain";
    if (code <= 67) return "fa-solid fa-cloud-showers-heavy";
    if (code <= 77) return "fa-solid fa-snowflake";
    if (code <= 82) return "fa-solid fa-cloud-showers-heavy";
    if (code <= 86) return "fa-solid fa-snowflake";
    return "fa-solid fa-cloud-bolt";
}

function getWeatherDescription(code) {
    if (code === 0) return "Clear sky";
    if (code <= 2) return "Partly cloudy";
    if (code === 3) return "Overcast";
    if (code <= 48) return "Foggy";
    if (code <= 55) return "Drizzle";
    if (code <= 65) return "Rain";
    if (code <= 67) return "Freezing rain";
    if (code <= 77) return "Snow";
    if (code <= 82) return "Rain showers";
    if (code <= 86) return "Snow showers";
    return "Thunderstorm";
}

function changeBackground(code) {
    document.body.dataset.weather = code === 0 ? "sunny" : code <= 3 ? "cloudy" : code <= 67 ? "rainy" : code <= 77 ? "snowy" : "storm";
}

function displayHourly(hourly, currentTime, timezone) {
    els.hourly.replaceChildren();
    const currentHour = currentTime.slice(0, 13);
    let start = hourly.time.findIndex((time) => time.slice(0, 13) >= currentHour);
    if (start < 0) start = 0;
    for (let i = start; i < Math.min(start + 8, hourly.time.length); i++) {
        const card = document.createElement("article");
        card.className = "hour-card";
        const time = document.createElement("span");
        time.textContent = i === start ? "Now" : formatApiTime(hourly.time[i], timezone, { hour: "numeric" });
        const icon = document.createElement("i");
        icon.className = getWeatherIcon(hourly.weather_code[i]);
        icon.setAttribute("aria-hidden", "true");
        const temp = document.createElement("strong");
        temp.textContent = `${Math.round(hourly.temperature_2m[i])}°`;
        card.append(time, icon, temp);
        els.hourly.append(card);
    }
}

function displayForecast(daily) {
    els.forecast.replaceChildren();
    for (let i = 0; i < Math.min(5, daily.time.length); i++) {
        const card = document.createElement("article");
        card.className = "forecast-card";
        const day = document.createElement("strong");
        day.textContent = i === 0 ? "Today" : formatDate(daily.time[i], { weekday: "short" });
        const icon = document.createElement("i");
        icon.className = getWeatherIcon(daily.weather_code[i]);
        icon.setAttribute("aria-hidden", "true");
        const temps = document.createElement("span");
        temps.innerHTML = `<b>${Math.round(daily.temperature_2m_max[i])}°</b><span>${Math.round(daily.temperature_2m_min[i])}°</span>`;
        card.append(day, icon, temps);
        els.forecast.append(card);
    }
}

function formatDate(date, options) {
    return new Intl.DateTimeFormat("en", { timeZone: "UTC", ...options }).format(new Date(`${date}T12:00:00Z`));
}
function formatApiTime(time, timezone, options) {
    // Open-Meteo returns local wall time for the requested timezone without an offset.
    return new Intl.DateTimeFormat("en", { timeZone: "UTC", ...options }).format(new Date(`${time.replace(" ", "T")}:00Z`));
}

function getLocationWeather() {
    if (!navigator.geolocation) return showError("Location services aren't available in this browser.");
    clearError();
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
        ({ coords }) => getWeather(coords.latitude, coords.longitude, "Your location"),
        () => { setLoading(false); showError("We couldn't access your location. Check your browser permissions and try again."); },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
}

function readHistory() {
    try {
        const value = JSON.parse(localStorage.getItem("weatherHistory") || "[]");
        return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    } catch { return []; }
}
function saveSearch(city) {
    const history = [city, ...readHistory().filter((item) => item !== city)].slice(0, 5);
    try { localStorage.setItem("weatherHistory", JSON.stringify(history)); } catch { /* storage may be disabled */ }
    displayHistory();
}
function displayHistory() {
    els.history.replaceChildren();
    for (const city of readHistory()) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = city;
        button.addEventListener("click", () => getWeatherByCity(city.split(",")[0]));
        els.history.append(button);
    }
}

function setLoading(active) {
    els.loading.innerHTML = active ? '<span class="spinner" aria-hidden="true"></span><span>Updating weather…</span>' : "";
    els.form.querySelector("button[type=submit]").disabled = active;
    els.location.disabled = active;
}
function showError(message) {
    els.error.textContent = message;
    els.error.hidden = false;
}
function clearError() { els.error.textContent = ""; els.error.hidden = true; }
function toggleTheme() {
    const light = document.body.classList.toggle("light");
    try { localStorage.setItem("theme", light ? "light" : "dark"); } catch { /* storage may be disabled */ }
    updateThemeIcon();
}
function loadTheme() {
    try { if (localStorage.getItem("theme") === "light") document.body.classList.add("light"); } catch { /* storage may be disabled */ }
    updateThemeIcon();
}
function updateThemeIcon() {
    const light = document.body.classList.contains("light");
    els.theme.innerHTML = `<i class="fa-solid fa-${light ? "moon" : "sun"}" aria-hidden="true"></i>`;
    els.theme.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
    els.theme.title = light ? "Switch to dark theme" : "Switch to light theme";
}
