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
    
    // Fetch weather for polygon points (like in CodePen but with HTTPS and correct params)
    async function fetchClimatePolygon(latlngs) {
        const climateDiv = document.getElementById('previewClimateSidebar');
        climateDiv.innerHTML = '<span class="loading">Loading climate data...</span>';
        
        let step = 0.05; // Start with ~5km sampling
        let points = samplePolygonPoints(latlngs, step);
        
        // Expand search radius until we get at least one point with data
        let attempt = 0;
        while (points.length < 1 && attempt < 5) {
            step += 0.01; // Expand search area
            const extraPoints = [];
            latlngs.forEach(p => {
                for (let dLat = -step; dLat <= step; dLat += step) {
                    for (let dLng = -step; dLng <= step; dLng += step) {
                        extraPoints.push({ lat: p.lat + dLat, lon: p.lng + dLng });
                    }
                }
            });
            points = points.concat(extraPoints);
            attempt++;
        }
        
        // Fallback to centroid if still no points
        if (points.length === 0) {
            const centroid = {
                lat: latlngs.reduce((sum, p) => sum + p.lat, 0) / latlngs.length,
                lon: latlngs.reduce((sum, p) => sum + p.lng, 0) / latlngs.length
            };
            points.push(centroid);
        }
        
        // Try to get data from multiple points and average them
        const tempsMax = [], tempsMin = [], precip = [], wind = [];
        let successfulRequests = 0;
        
        // Limit to first 10 points to avoid too many requests
        const pointsToTry = points.slice(0, 10);
        
        for (let p of pointsToTry) {
            try {
                // Use HTTPS and correct parameters
                const apiUrl = `https://api.open-meteo.com/v1/forecast?` +
                    `latitude=${p.lat}&longitude=${p.lon}&` +
                    `daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&` +
                    `current=temperature_2m,relative_humidity_2m,wind_speed_10m&` +
                    `timezone=auto&forecast_days=7`;
                
                console.log(`Trying point ${p.lat}, ${p.lon}`);
                
                const res = await fetch(apiUrl);
                
                if (!res.ok) {
                    console.log(`Failed for point ${p.lat}, ${p.lon}: ${res.status}`);
                    continue;
                }
                
                const data = await res.json();
                console.log('API Response:', data);
                
                if (!data.daily || !data.current) {
                    console.log(`No data available for point ${p.lat}, ${p.lon}`);
                    continue;
                }
                
                const daily = data.daily;
                const current = data.current;
                
                // Collect valid data
                if (daily.temperature_2m_max && daily.temperature_2m_max[0] !== null) {
                    tempsMax.push(daily.temperature_2m_max[0]);
                }
                if (daily.temperature_2m_min && daily.temperature_2m_min[0] !== null) {
                    tempsMin.push(daily.temperature_2m_min[0]);
                }
                if (daily.precipitation_sum && daily.precipitation_sum[0] !== null) {
                    precip.push(daily.precipitation_sum[0]);
                }
                if (daily.wind_speed_10m_max && daily.wind_speed_10m_max[0] !== null) {
                    wind.push(daily.wind_speed_10m_max[0]);
                }
                
                successfulRequests++;
                
                // If we got data from the first point, show it immediately and continue collecting
                if (successfulRequests === 1) {
                    climateDiv.textContent = `Climate Data (${successfulRequests} point${successfulRequests > 1 ? 's' : ''}):
Current Temperature: ${current.temperature_2m || 'N/A'}°C
Current Humidity: ${current.relative_humidity_2m || 'N/A'}%
Current Wind: ${current.wind_speed_10m || 'N/A'} km/h

Today's Forecast:
Max Temperature: ${daily.temperature_2m_max[0] || 'N/A'}°C
Min Temperature: ${daily.temperature_2m_min[0] || 'N/A'}°C
Precipitation: ${daily.precipitation_sum[0] || 0} mm
Wind Speed: ${daily.wind_speed_10m_max[0] || 'N/A'} km/h

Collecting more data...`;
                }
                
            } catch(e) { 
                console.error(`Error for point ${p.lat}, ${p.lon}:`, e);
                continue;
            }
        }
        
        // Calculate and display averages if we got multiple data points
        if (successfulRequests > 0) {
            const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1) : 'N/A';
            
            climateDiv.textContent = `Climate Analysis (${successfulRequests} data point${successfulRequests > 1 ? 's' : ''}):

${successfulRequests > 1 ? 'Average ' : ''}Max Temperature: ${avg(tempsMax)}°C
${successfulRequests > 1 ? 'Average ' : ''}Min Temperature: ${avg(tempsMin)}°C
${successfulRequests > 1 ? 'Average ' : ''}Precipitation: ${avg(precip)} mm
${successfulRequests > 1 ? 'Average ' : ''}Wind Speed: ${avg(wind)} km/h

Data points sampled: ${successfulRequests}/${pointsToTry.length}`;
        } else {
            climateDiv.innerHTML = `<span class="error">No climate data available for this location.
Try clicking on a different area or check your internet connection.</span>`;
        }
    }
    
    function setupMarker(latlng) {
        if (!marker) {
            marker = L.marker(latlng, { draggable: true }).addTo(map);
            marker.on('dragend', ev => {
                const pos = ev.target.getLatLng();
                updateCoords(pos);
                reverseGeocode(pos.lat, pos.lng);
                fetchClimatePolygon([{lat: pos.lat, lng: pos.lng}]);
            });
            marker.on('click', removeMarker);
        } else {
            marker.setLatLng(latlng);
        }
        
        updateCoords(latlng);
        reverseGeocode(latlng.lat, latlng.lng);
        fetchClimatePolygon([{lat: latlng.lat, lng: latlng.lng}]);
    }
    
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
        document.getElementById('previewType').textContent = 
            document.getElementById('plotType').value || '—';
            
        const areaVal = document.getElementById('plotArea').value;
        document.getElementById('previewArea').textContent = 
            areaVal ? areaVal + ' m²' : '—';
            
        document.getElementById('previewLocation').textContent = 
            document.getElementById('plotLocation').value || '—';
    });
});
