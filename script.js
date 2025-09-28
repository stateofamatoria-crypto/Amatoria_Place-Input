document.addEventListener('DOMContentLoaded', function() {
    const map = L.map('map').setView([51.505, -0.09], 13);
    
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    const satellite = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        subdomains: ['mt0','mt1','mt2','mt3'],
        attribution: '© Google'
    });
    
   L.control.layers({ "OSM": osm, "Satellite": satellite }).addTo(map);

// Add geocoder control with custom behavior
L.Control.geocoder({
    defaultMarkGeocode: false,
    position: 'topleft',
    placeholder: 'Search for places...',
    errorMessage: 'Location not found'
}).on('markgeocode', function(e) {
    const latlng = e.geocode.center;
    map.setView(latlng, 15);
}).addTo(map);
    
    let marker;
    
    function updateCoords(latlng) {
        document.getElementById('previewCoords').textContent = 
            `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    }
    
    function removeMarker() {
        if (marker) {
            map.removeLayer(marker);
            marker = null;
            document.getElementById('previewCoords').textContent = "—";
            document.getElementById('plotLocation').value = "";
            document.getElementById('previewClimateSidebar').textContent = "—";
            document.getElementById('climate-dashboard').style.display = 'none';
        }
    }
    
    document.getElementById('removePin').addEventListener('click', removeMarker);
    
    function reverseGeocode(lat, lng, callback) {
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
            .then(res => res.json())
            .then(data => {
                if (data?.display_name) {
                    document.getElementById('plotLocation').value = data.display_name;
                }
                if (callback) callback(data);
            })
            .catch(err => console.error('Geocoding error:', err));
    }
    
    // Sample points inside polygon
    function samplePolygonPoints(latlngs, step = 0.01) {
        const lats = latlngs.map(p => p.lat);
        const lons = latlngs.map(p => p.lng);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLon = Math.min(...lons), maxLon = Math.max(...lons);
        
        const points = [];
        for (let lat = minLat; lat <= maxLat; lat += step) {
            for (let lon = minLon; lon <= maxLon; lon += step) {
                if (pointInPolygon([lat, lon], latlngs)) {
                    points.push({ lat, lon });
                }
            }
        }
        return points;
    }
    
    function pointInPolygon(point, vs) {
        const x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i].lat, yi = vs[i].lng;
            const xj = vs[j].lat, yj = vs[j].lng;
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-10) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    
    // Weather code to description mapping
    function getWeatherDescription(code) {
        const weatherCodes = {
            0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
            45: "Foggy", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Moderate drizzle", 
            55: "Dense drizzle", 56: "Light freezing drizzle", 57: "Dense freezing drizzle",
            61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain", 66: "Light freezing rain", 
            67: "Heavy freezing rain", 71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
            77: "Snow grains", 80: "Slight rain showers", 81: "Moderate rain showers", 
            82: "Violent rain showers", 85: "Slight snow showers", 86: "Heavy snow showers",
            95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail"
        };
        return weatherCodes[code] || "Unknown";
    }
    
    // Process climate data from different sources
    function processClimateData(daily, dataType) {
        const temps = daily.temperature_2m_max.concat(daily.temperature_2m_min).filter(t => t !== null);
        const maxTemps = daily.temperature_2m_max.filter(t => t !== null);
        const minTemps = daily.temperature_2m_min.filter(t => t !== null);
        const precip = daily.precipitation_sum.filter(p => p !== null);
        const wind = daily.wind_speed_10m_max.filter(w => w !== null);
        
        // For different data types, we need different seasonal calculations
        let winterTemps = [], summerTemps = [], winterPrecip = [], summerPrecip = [];
        
        if (dataType === "climate") {
            // Climate data is already averaged, so we approximate seasons
            const dataLength = maxTemps.length;
            const quarterLength = Math.floor(dataLength / 4);
            
            winterTemps = maxTemps.slice(0, quarterLength).concat(maxTemps.slice(dataLength - quarterLength));
            summerTemps = maxTemps.slice(quarterLength * 2, quarterLength * 3);
            winterPrecip = precip.slice(0, quarterLength).concat(precip.slice(dataLength - quarterLength));
            summerPrecip = precip.slice(quarterLength * 2, quarterLength * 3);
        } else if (dataType === "historical") {
            // Process actual dates for historical data
            daily.temperature_2m_max.forEach((temp, index) => {
                if (temp === null) return;
                const dayOfYear = index % 365; // Approximate day of year
                
                // Winter: Dec, Jan, Feb (approx days 335-365, 0-59)
                // Summer: Jun, Jul, Aug (approx days 152-243)
                if (dayOfYear > 335 || dayOfYear < 59) {
                    winterTemps.push(temp);
                    if (daily.precipitation_sum[index] !== null) {
                        winterPrecip.push(daily.precipitation_sum[index]);
                    }
                } else if (dayOfYear >= 152 && dayOfYear <= 243) {
                    summerTemps.push(temp);
                    if (daily.precipitation_sum[index] !== null) {
                        summerPrecip.push(daily.precipitation_sum[index]);
                    }
                }
            });
        } else {
            // For forecast data, just use the available data
            winterTemps = maxTemps.slice(0, Math.floor(maxTemps.length / 2));
            summerTemps = maxTemps.slice(Math.floor(maxTemps.length / 2));
            winterPrecip = precip.slice(0, Math.floor(precip.length / 2));
            summerPrecip = precip.slice(Math.floor(precip.length / 2));
        }
        
        // Scale factors for different data types
        let scaleFactor = 1;
        if (dataType === "forecast") {
            scaleFactor = 365 / maxTemps.length; // Scale 14-day data to yearly estimates
        } else if (dataType === "historical" && maxTemps.length < 365) {
            scaleFactor = 365 / maxTemps.length; // Scale partial year data
        }
        
        return {
            avgTemp: temps.length ? (temps.reduce((a,b) => a+b) / temps.length).toFixed(1) : 'N/A',
            maxTemp: maxTemps.length ? Math.max(...maxTemps).toFixed(1) : 'N/A',
            minTemp: minTemps.length ? Math.min(...minTemps).toFixed(1) : 'N/A',
            avgMaxTemp: maxTemps.length ? (maxTemps.reduce((a,b) => a+b) / maxTemps.length).toFixed(1) : 'N/A',
            avgMinTemp: minTemps.length ? (minTemps.reduce((a,b) => a+b) / minTemps.length).toFixed(1) : 'N/A',
            totalPrecip: precip.length ? (precip.reduce((a,b) => a+b) * scaleFactor).toFixed(0) : 'N/A',
            avgWindSpeed: wind.length ? (wind.reduce((a,b) => a+b) / wind.length).toFixed(1) : 'N/A',
            maxWindSpeed: wind.length ? Math.max(...wind).toFixed(1) : 'N/A',
            frostDays: Math.round(minTemps.filter(t => t < 0).length * scaleFactor),
            hotDays: Math.round(maxTemps.filter(t => t > 30).length * scaleFactor),
            rainyDays: Math.round(precip.filter(p => p > 1).length * scaleFactor),
            winterTemp: winterTemps.length ? (winterTemps.reduce((a,b) => a+b) / winterTemps.length).toFixed(1) : 'N/A',
            summerTemp: summerTemps.length ? (summerTemps.reduce((a,b) => a+b) / summerTemps.length).toFixed(1) : 'N/A',
            winterPrecip: winterPrecip.length ? (winterPrecip.reduce((a,b) => a+b) * (scaleFactor/4)).toFixed(0) : 'N/A',
            summerPrecip: summerPrecip.length ? (summerPrecip.reduce((a,b) => a+b) * (scaleFactor/4)).toFixed(0) : 'N/A'
        };
    }
    
    function classifyClimate(avgTemp, winterTemp, summerTemp, annualPrecip, summerPrecip) {
        // Simplified Köppen-Geiger classification
        if (avgTemp < 0) return "Polar climate";
        if (avgTemp < 10) return "Continental climate";
        if (winterTemp < 0 && summerTemp > 22) return "Continental climate with warm summers";
        if (winterTemp < 0 && summerTemp < 22) return "Continental climate with cool summers";
        if (winterTemp > 0 && summerTemp > 22 && annualPrecip > 1000) return "Humid subtropical climate";
        if (winterTemp > 0 && summerTemp > 22 && annualPrecip < 600) return "Mediterranean climate";
        if (winterTemp > 5 && summerTemp > 22) return "Mediterranean climate";
        if (winterTemp > 0 && summerTemp < 22) return "Temperate oceanic climate";
        if (avgTemp > 18 && annualPrecip > 1500) return "Tropical climate";
        if (avgTemp > 18 && annualPrecip < 600) return "Arid climate";
        return "Temperate climate";
    }
    
    // Get seasonal description
    function getSeasonalDescription(winterTemp, summerTemp, annualPrecip) {
        let desc = "";
        
        // Temperature characteristics
        if (winterTemp < -5) desc += "Cold winters";
        else if (winterTemp < 5) desc += "Cool winters";
        else if (winterTemp < 15) desc += "Mild winters";
        else desc += "Warm winters";
        
        if (summerTemp < 20) desc += ", cool summers";
        else if (summerTemp < 25) desc += ", mild summers";
        else if (summerTemp < 30) desc += ", warm summers";
        else desc += ", hot summers";
        
        // Precipitation characteristics
        if (annualPrecip < 400) desc += ". Arid conditions";
        else if (annualPrecip < 800) desc += ". Semi-arid conditions";
        else if (annualPrecip < 1200) desc += ". Moderate rainfall";
        else if (annualPrecip < 2000) desc += ". High rainfall";
        else desc += ". Very high rainfall";
        
        return desc;
    }
    
    // Function to show and populate the climate dashboard
    function showClimateDashboard(climateData, currentData, yearlyStats, dataSource) {
        document.getElementById('climate-dashboard').style.display = 'block';
        
        if (currentData && currentData.current) {
            const current = currentData.current;
            const currentItems = document.querySelectorAll('#climate-dashboard .current-item .value');
            if (currentItems[0]) currentItems[0].textContent = getWeatherDescription(current.weather_code) || 'N/A';
            if (currentItems[1]) currentItems[1].textContent = current.temperature_2m ? `${current.temperature_2m}°C` : 'N/A';
            if (currentItems[2]) currentItems[2].textContent = current.relative_humidity_2m ? `${current.relative_humidity_2m}%` : 'N/A';
            if (currentItems[3]) currentItems[3].textContent = current.wind_speed_10m ? `${current.wind_speed_10m} km/h` : 'N/A';
        }
        
        if (yearlyStats) {
            const climateClass = classifyClimate(
                parseFloat(yearlyStats.avgTemp),
                parseFloat(yearlyStats.winterTemp), 
                parseFloat(yearlyStats.summerTemp),
                parseFloat(yearlyStats.totalPrecip),
                parseFloat(yearlyStats.summerPrecip)
            );
            
            const seasonalDesc = getSeasonalDescription(
                parseFloat(yearlyStats.winterTemp),
                parseFloat(yearlyStats.summerTemp),
                parseFloat(yearlyStats.totalPrecip)
            );
            
            const climateTypeEl = document.querySelector('.climate-type');
            const climateDescEl = document.querySelector('.climate-description');
            if (climateTypeEl) climateTypeEl.textContent = climateClass;
            if (climateDescEl) climateDescEl.textContent = seasonalDesc;
            
            updateInfoItems(yearlyStats);
            updatePlanningNotes(yearlyStats);
        }
        
        const dataSourceEl = document.querySelector('.data-source');
        if (dataSourceEl) dataSourceEl.textContent = `Data Source: ${dataSource}`;
        
        updateChartData(yearlyStats);
    }
    
    function updateInfoItems(yearlyStats) {
        const infoItems = document.querySelectorAll('.info-item .value');
        if (infoItems[0]) infoItems[0].textContent = `${(parseFloat(yearlyStats.maxTemp) - parseFloat(yearlyStats.minTemp)).toFixed(1)}°C`;
        if (infoItems[1]) infoItems[1].textContent = `${yearlyStats.hotDays} days`;
        if (infoItems[2]) infoItems[2].textContent = `${yearlyStats.frostDays} days`;
        if (infoItems[3]) infoItems[3].textContent = yearlyStats.frostDays < 100 ? 'Long' : yearlyStats.frostDays < 200 ? 'Moderate' : 'Short';
        if (infoItems[4]) infoItems[4].textContent = `${parseInt(yearlyStats.totalPrecip).toLocaleString()} mm`;
        if (infoItems[5]) infoItems[5].textContent = `${yearlyStats.rainyDays} days`;
        if (infoItems[6]) infoItems[6].textContent = parseFloat(yearlyStats.avgWindSpeed) > 15 ? 'High' : parseFloat(yearlyStats.avgWindSpeed) > 10 ? 'Moderate' : 'Low';
        if (infoItems[7]) infoItems[7].textContent = `${yearlyStats.maxWindSpeed} km/h`;
    }
    
    function updatePlanningNotes(yearlyStats) {
        const notesList = document.querySelectorAll('.note-category ul');
        
        if (notesList[0]) {
            const frostFreeDays = Math.max(0, 365 - yearlyStats.frostDays);
            const growingSeason = yearlyStats.frostDays < 100 ? 'Long' : yearlyStats.frostDays < 200 ? 'Moderate' : 'Short';
            const irrigationNeeds = parseFloat(yearlyStats.totalPrecip) < 400 ? 'High' : parseFloat(yearlyStats.totalPrecip) < 800 ? 'Moderate' : 'Low';
            const heatStress = yearlyStats.hotDays > 30 ? 'High' : yearlyStats.hotDays > 10 ? 'Moderate' : 'Low';
            
            notesList[0].innerHTML = `
                <li>Growing Season: ${growingSeason} (${frostFreeDays} frost-free days)</li>
                <li>Irrigation Needs: ${irrigationNeeds}</li>
                <li>Heat Stress Risk: ${heatStress}</li>
            `;
        }
        
        if (notesList[1]) {
            const coolingDemand = yearlyStats.hotDays > 20 ? 'High AC requirements' : 'Moderate cooling needs';
            const heatingDemand = yearlyStats.frostDays > 100 ? 'Significant heating required' : 'Moderate heating needs';
            const drainagePlanning = parseFloat(yearlyStats.totalPrecip) > 1000 ? 'Important for high rainfall' : 'Standard drainage sufficient';
            const greenInfra = parseFloat(yearlyStats.totalPrecip) < 600 ? 'Drought-resistant plants' : 'Various plant options suitable';
            
            notesList[1].innerHTML = `
                <li>Cooling Demand: ${coolingDemand}</li>
                <li>Heating Demand: ${heatingDemand}</li>
                <li>Drainage Planning: ${drainagePlanning}</li>
                <li>Green Infrastructure: ${greenInfra}</li>
            `;
        }
    }
    
    function updateChartData(yearlyStats) {
        if (!yearlyStats) return;
        
        if (window.tempChart) {
            window.tempChart.data.datasets[0].data = [
                parseFloat(yearlyStats.avgTemp),
                parseFloat(yearlyStats.avgMaxTemp), 
                parseFloat(yearlyStats.avgMinTemp),
                parseFloat(yearlyStats.winterTemp),
                parseFloat(yearlyStats.summerTemp)
            ];
            window.tempChart.update();
        }
        
        if (window.extremesChart) {
            const normalDays = Math.max(0, 365 - yearlyStats.hotDays - yearlyStats.frostDays);
            window.extremesChart.data.datasets[0].data = [
                yearlyStats.hotDays,
                yearlyStats.frostDays,
                normalDays
            ];
            window.extremesChart.update();
        }
        
        if (window.precipChart) {
            window.precipChart.data.datasets[0].data = [
                parseFloat(yearlyStats.winterPrecip),
                parseFloat(yearlyStats.summerPrecip),
                parseFloat(yearlyStats.totalPrecip) / 10
            ];
            window.precipChart.update();
        }
        
        if (window.windChart) {
            const windExposure = parseFloat(yearlyStats.avgWindSpeed) > 15 ? 80 : parseFloat(yearlyStats.avgWindSpeed) > 10 ? 60 : 40;
            window.windChart.data.datasets[0].data = [
                parseFloat(yearlyStats.avgWindSpeed),
                parseFloat(yearlyStats.maxWindSpeed),
                windExposure
            ];
            window.windChart.update();
        }
    }
    
    // Comprehensive climate data fetching - YOUR ORIGINAL FULL VERSION
    async function fetchComprehensiveClimate(lat, lng) {
        const climateDiv = document.getElementById('previewClimateSidebar');
        climateDiv.innerHTML = '<span class="loading">Loading comprehensive climate data...</span>';
        
        try {
            // Try multiple approaches to get comprehensive data
            
            // 1. Try climate data (30-year averages) - this is usually more reliable
            const climateUrl = `https://climate-api.open-meteo.com/v1/climate?` +
                `latitude=${lat}&longitude=${lng}&` +
                `daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&` +
                `start_date=1991-01-01&end_date=2020-12-31`;
            
            // 2. Get current weather for immediate context
            const currentUrl = `https://api.open-meteo.com/v1/forecast?` +
                `latitude=${lat}&longitude=${lng}&` +
                `current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&` +
                `daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,` +
                `sunshine_duration&forecast_days=14&timezone=auto`;
            
            // 3. Try to get some historical data from recent years
            const recentHistoricalUrl = `https://archive-api.open-meteo.com/v1/archive?` +
                `latitude=${lat}&longitude=${lng}&` +
                `start_date=2022-01-01&end_date=2023-12-31&` +
                `daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto`;
            
            console.log('Trying climate data API:', climateUrl);
            console.log('Fetching current data:', currentUrl);
            console.log('Trying recent historical:', recentHistoricalUrl);
            
            const [climateRes, currentRes, recentRes] = await Promise.all([
                fetch(climateUrl).catch(() => ({ ok: false })),
                fetch(currentUrl).catch(() => ({ ok: false })),
                fetch(recentHistoricalUrl).catch(() => ({ ok: false }))
            ]);
            
            let climateData = null;
            let currentData = null;
            let recentData = null;
            
            if (climateRes.ok) {
                try {
                    climateData = await climateRes.json();
                    console.log('Climate data received:', climateData);
                } catch (e) {
                    console.log('Climate data parsing failed:', e);
                }
            }
            
            if (currentRes.ok) {
                try {
                    currentData = await currentRes.json();
                    console.log('Current data received:', currentData);
                } catch (e) {
                    console.log('Current data parsing failed:', e);
                }
            }
            
            if (recentRes.ok) {
                try {
                    recentData = await recentRes.json();
                    console.log('Recent historical data received:', recentData);
                } catch (e) {
                    console.log('Recent historical parsing failed:', e);
                }
            }
            
            
            if (!climateData && !currentData && !recentData) {
                throw new Error('No climate data available from any source');
            }
            
            // Process the best available data
            let yearlyStats = null;
            let dataSource = "";
            
            // Prefer climate data (30-year averages), then recent historical, then current
            if (climateData?.daily) {
                dataSource = "30-year climate averages (1991-2020)";
                yearlyStats = processClimateData(climateData.daily, "climate");
            } else if (recentData?.daily) {
                dataSource = "recent historical data (2022-2023)";
                yearlyStats = processClimateData(recentData.daily, "historical");
            } else if (currentData?.daily) {
                dataSource = "14-day forecast extended analysis";
                yearlyStats = processClimateData(currentData.daily, "forecast");
            }
            
            // Get current weather context
            let currentWeather = "";
            if (currentData?.current) {
                const current = currentData.current;
                const weatherDesc = getWeatherDescription(current.weather_code);
                currentWeather = `CURRENT CONDITIONS:
Weather: ${weatherDesc}
Temperature: ${current.temperature_2m || 'N/A'}°C
Humidity: ${current.relative_humidity_2m || 'N/A'}%
Wind Speed: ${current.wind_speed_10m || 'N/A'} km/h

`;
            }
            
            // Build comprehensive climate report
            let climateReport = currentWeather;
            
            if (yearlyStats) {
                const climateClass = classifyClimate(
                    parseFloat(yearlyStats.avgTemp),
                    parseFloat(yearlyStats.winterTemp),
                    parseFloat(yearlyStats.summerTemp),
                    parseFloat(yearlyStats.totalPrecip),
                    parseFloat(yearlyStats.summerPrecip)
                );
                
                const seasonalDesc = getSeasonalDescription(
                    parseFloat(yearlyStats.winterTemp),
                    parseFloat(yearlyStats.summerTemp),
                    parseFloat(yearlyStats.totalPrecip)
                );
                
                climateReport += `CLIMATE CLASSIFICATION:
${climateClass}
${seasonalDesc}

DATA SOURCE: ${dataSource}

TEMPERATURE ANALYSIS:
Average Temperature: ${yearlyStats.avgTemp}°C
Average Maximum: ${yearlyStats.avgMaxTemp}°C
Average Minimum: ${yearlyStats.avgMinTemp}°C
Winter Average: ${yearlyStats.winterTemp}°C
Summer Average: ${yearlyStats.summerTemp}°C

EXTREMES:
Absolute Maximum: ${yearlyStats.maxTemp}°C
Absolute Minimum: ${yearlyStats.minTemp}°C
Temperature Range: ${(parseFloat(yearlyStats.maxTemp) - parseFloat(yearlyStats.minTemp)).toFixed(1)}°C
Hot Days (>30°C): ${yearlyStats.hotDays} days/year
Frost Days (<0°C): ${yearlyStats.frostDays} days/year

PRECIPITATION:
Annual Total: ${yearlyStats.totalPrecip} mm
Winter Total: ${yearlyStats.winterPrecip} mm
Summer Total: ${yearlyStats.summerPrecip} mm
Dry Season: ${yearlyStats.winterPrecip < yearlyStats.summerPrecip ? 'Winter' : 'Summer'}
Rainy Days (>1mm): ${yearlyStats.rainyDays} days/year

WIND CONDITIONS:
Average Wind: ${yearlyStats.avgWindSpeed} km/h
Maximum Wind: ${yearlyStats.maxWindSpeed} km/h
Wind Exposure: ${parseFloat(yearlyStats.avgWindSpeed) > 15 ? 'High' : parseFloat(yearlyStats.avgWindSpeed) > 10 ? 'Moderate' : 'Low'}

AGRICULTURAL SUITABILITY:
Growing Season: ${yearlyStats.frostDays < 100 ? 'Long' : yearlyStats.frostDays < 200 ? 'Moderate' : 'Short'} (${Math.max(0, 365-yearlyStats.frostDays)} frost-free days)
Irrigation Needs: ${parseFloat(yearlyStats.totalPrecip) < 400 ? 'High' : parseFloat(yearlyStats.totalPrecip) < 800 ? 'Moderate' : 'Low'}
Heat Stress Risk: ${yearlyStats.hotDays > 30 ? 'High' : yearlyStats.hotDays > 10 ? 'Moderate' : 'Low'}

URBAN PLANNING NOTES:
- Cooling Demand: ${yearlyStats.hotDays > 20 ? 'High AC requirements' : 'Moderate cooling needs'}
- Heating Demand: ${yearlyStats.frostDays > 100 ? 'Significant heating required' : 'Moderate heating needs'}
- Drainage Planning: ${parseFloat(yearlyStats.totalPrecip) > 1000 ? 'Important for high rainfall' : 'Standard drainage sufficient'}
- Green Infrastructure: ${parseFloat(yearlyStats.totalPrecip) < 600 ? 'Drought-resistant plants' : 'Various plant options suitable'}`;
            } else {
                climateReport += `LIMITED FORECAST DATA AVAILABLE
Unable to access comprehensive climate databases.
Showing available forecast information only.`;
            }
            
            climateDiv.textContent = climateReport;
            
            // Show dashboard with real data
            showClimateDashboard(climateData, currentData, yearlyStats, dataSource);
            
        } catch (error) {
            console.error('Climate data fetch error:', error);
            climateDiv.innerHTML = `<span class="error">Comprehensive climate data unavailable. 
Error: ${error.message}
Trying simplified forecast...</span>`;
            
            // Fallback to basic forecast
            try {
                const basicUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&forecast_days=7`;
                const basicRes = await fetch(basicUrl);
                const basicData = await basicRes.json();
                
                if (basicData.current && basicData.daily) {
                    const current = basicData.current;
                    const daily = basicData.daily;
                    
                    climateDiv.textContent = `CURRENT CONDITIONS:
Temperature: ${current.temperature_2m}°C
Humidity: ${current.relative_humidity_2m}%
Wind Speed: ${current.wind_speed_10m} km/h

7-DAY FORECAST:
Max Temp Range: ${Math.min(...daily.temperature_2m_max)} - ${Math.max(...daily.temperature_2m_max)}°C
Min Temp Range: ${Math.min(...daily.temperature_2m_min)} - ${Math.max(...daily.temperature_2m_min)}°C
Total Precipitation: ${daily.precipitation_sum.reduce((a,b) => a+b)} mm

Note: Comprehensive yearly data unavailable.`;
                }
            } catch (fallbackError) {
                climateDiv.innerHTML = `<span class="error">All climate APIs unavailable. Please try again later.</span>`;
            }
        }
    }
    
   // Fetch weather for polygon points
    async function fetchClimatePolygon(latlngs) {
        if (latlngs.length === 1) {
            // Single point
            await fetchComprehensiveClimate(latlngs[0].lat, latlngs[0].lng);
            return;
        }
        
        // Use centroid for polygon climate data
        const centroidLat = latlngs.reduce((sum, p) => sum + p.lat, 0) / latlngs.length;
        const centroidLng = latlngs.reduce((sum, p) => sum + p.lng, 0) / latlngs.length;
        
        await fetchComprehensiveClimate(centroidLat, centroidLng);
    }
    
    function setupMarker(latlng) {
        if (!marker) {
            marker = L.marker(latlng, { draggable: true }).addTo(map);
            marker.on('dragend', ev => {
                const pos = ev.target.getLatLng();
                updateCoords(pos);
                reverseGeocode(pos.lat, pos.lng);
                fetchComprehensiveClimate(pos.lat, pos.lng);
            });
            marker.on('click', removeMarker);
        } else {
            marker.setLatLng(latlng);
        }
        
        updateCoords(latlng);
        reverseGeocode(latlng.lat, latlng.lng);
        fetchComprehensiveClimate(latlng.lat, latlng.lng);
    }

    function updateNewFields() {
        const intent = document.getElementById('developmentIntent');
        document.getElementById('factsheet-intent').textContent = 
            intent.value ? intent.options[intent.selectedIndex].text : '—';
        
        const timeline = document.getElementById('timeline');
        document.getElementById('factsheet-timeline').textContent = 
            timeline.value ? timeline.options[timeline.selectedIndex].text : '—';
        
        const budgetValue = document.getElementById('budget').value;
        const currency = document.getElementById('currency').value;
        
        let budgetLabels;
        if (currency === 'JPY') {
            budgetLabels = [
                `<50M ${currency}`, 
                `50M-200M ${currency}`, 
                `200M-500M ${currency}`, 
                `500M-1B ${currency}`, 
                `1B-2B ${currency}`, 
                `2B+ ${currency}`
            ];
        } else {
            budgetLabels = [
                `<500K ${currency}`, 
                `500K-2M ${currency}`, 
                `2M-5M ${currency}`, 
                `5M-10M ${currency}`, 
                `10M-20M ${currency}`, 
                `20M+ ${currency}`
            ];
        }
        
        document.getElementById('factsheet-budget').textContent = budgetLabels[budgetValue - 1];
        
        const focusValue = document.getElementById('focusBalance').value;
        let focusText = 'Balanced';
        if (focusValue <= 3) focusText = 'Profit Focus';
        if (focusValue >= 8) focusText = 'Planet Focus';
        document.getElementById('factsheet-focus').textContent = focusText;
    }

    // Add event listeners
    document.getElementById('developmentIntent').addEventListener('change', updateNewFields);
    document.getElementById('timeline').addEventListener('change', updateNewFields);
    document.getElementById('budget').addEventListener('input', updateNewFields);
    document.getElementById('currency').addEventListener('change', updateNewFields);
    document.getElementById('focusBalance').addEventListener('input', updateNewFields);
    
    map.on('click', e => setupMarker(e.latlng));
    
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    
    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: { 
            marker: false, 
            circle: false, 
            polyline: false, 
            rectangle: true, 
            polygon: true 
        }
    });
    map.addControl(drawControl);
    
    map.on(L.Draw.Event.CREATED, e => {
        drawnItems.clearLayers();
        const layer = e.layer;
        drawnItems.addLayer(layer);
        
        const geojson = layer.toGeoJSON();
        const area = turf.area(geojson);
        const perimeter = turf.length(geojson, { units: 'meters' });
        const centroid = turf.centroid(geojson);
        
        document.getElementById('plotArea').value = Math.round(area);
        document.getElementById('previewArea').textContent = Math.round(area) + ' m²';
        document.getElementById('previewPerimeter').textContent = perimeter.toFixed(1) + ' m';
        
        const lat = centroid.geometry.coordinates[1];
        const lng = centroid.geometry.coordinates[0];
        
        // Fetch climate for polygon (averaged)
        const latlngs = layer.getLatLngs()[0];
        setupMarker({ lat, lng });
        fetchClimatePolygon(latlngs);
    });
    
    document.getElementById('savePlot').addEventListener('click', () => {
        document.getElementById('previewName').textContent = 
            document.getElementById('plotName').value || '—';
        
        const intent = document.getElementById('developmentIntent');
        document.getElementById('previewType').textContent = 
            intent.value ? intent.options[intent.selectedIndex].text : '—';
            
        const areaVal = document.getElementById('plotArea').value;
        document.getElementById('previewArea').textContent = 
            areaVal ? areaVal + ' m²' : '—';
            
        document.getElementById('previewLocation').textContent = 
            document.getElementById('plotLocation').value || '—';

        updateNewFields();
    });
});
