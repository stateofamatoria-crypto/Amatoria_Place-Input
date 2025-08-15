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
    
    // Fixed climate data fetching function
    async function fetchClimateData(lat, lng) {
        const climateDiv = document.getElementById('previewClimateSidebar');
        climateDiv.innerHTML = '<span class="loading">Loading climate data...</span>';
        
        try {
            // Use HTTPS and correct parameter names
            const apiUrl = `https://api.open-meteo.com/v1/forecast?` +
                `latitude=${lat}&longitude=${lng}&` +
                `daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&` +
                `current=temperature_2m,relative_humidity_2m,wind_speed_10m&` +
                `timezone=auto&forecast_days=7`;
            
            console.log('Fetching climate data from:', apiUrl);
            
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Climate data received:', data);
            
            if (!data.daily || !data.current) {
                throw new Error('No weather data available');
            }
            
            const daily = data.daily;
            const current = data.current;
            
            // Calculate averages for 7-day forecast
            const avgMaxTemp = calculateAverage(daily.temperature_2m_max);
            const avgMinTemp = calculateAverage(daily.temperature_2m_min);
            const totalPrecip = daily.precipitation_sum.reduce((sum, val) => sum + (val || 0), 0);
            const avgWindSpeed = calculateAverage(daily.wind_speed_10m_max);
            
            // Display results
            climateDiv.textContent = `Current Weather & 7-Day Forecast:
Current Temperature: ${current.temperature_2m || 'N/A'}°C
Current Humidity: ${current.relative_humidity_2m || 'N/A'}%
Current Wind Speed: ${current.wind_speed_10m || 'N/A'} km/h

7-Day Averages:
Avg Max Temperature: ${avgMaxTemp}°C
Avg Min Temperature: ${avgMinTemp}°C
Total Precipitation: ${totalPrecip.toFixed(1)} mm
Avg Max Wind Speed: ${avgWindSpeed} km/h`;
            
        } catch (error) {
            console.error('Climate data fetch error:', error);
            climateDiv.innerHTML = `<span class="error">Climate data unavailable. 
Error: ${error.message}
Please try again later.</span>`;
        }
    }
    
    function calculateAverage(values) {
        if (!values || values.length === 0) return 'N/A';
        const validValues = values.filter(v => v !== null && v !== undefined);
        if (validValues.length === 0) return 'N/A';
        const sum = validValues.reduce((a, b) => a + b, 0);
        return (sum / validValues.length).toFixed(1);
    }
    
    // Simplified polygon climate fetching
    async function fetchClimatePolygon(latlngs) {
        if (latlngs.length === 1) {
            // Single point
            await fetchClimateData(latlngs[0].lat, latlngs[0].lng);
            return;
        }
        
        // Use centroid for polygon climate data
        const centroidLat = latlngs.reduce((sum, p) => sum + p.lat, 0) / latlngs.length;
        const centroidLng = latlngs.reduce((sum, p) => sum + p.lng, 0) / latlngs.length;
        
        await fetchClimateData(centroidLat, centroidLng);
    }
    
    function setupMarker(latlng) {
        if (!marker) {
            marker = L.marker(latlng, { draggable: true }).addTo(map);
            marker.on('dragend', ev => {
                const pos = ev.target.getLatLng();
                updateCoords(pos);
                reverseGeocode(pos.lat, pos.lng);
                fetchClimateData(pos.lat, pos.lng);
            });
            marker.on('click', removeMarker);
        } else {
            marker.setLatLng(latlng);
        }
        
        updateCoords(latlng);
        reverseGeocode(latlng.lat, latlng.lng);
        fetchClimateData(latlng.lat, latlng.lng);
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
        
        // Fetch climate for polygon
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
