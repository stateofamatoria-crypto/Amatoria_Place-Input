document.addEventListener('DOMContentLoaded', function() {

  const map = L.map('map').setView([51.505, -0.09], 13);

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const satellite = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    subdomains: ['mt0','mt1','mt2','mt3'],
    attribution: '&copy; Google'
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
        if (data?.display_name) document.getElementById('plotLocation').value = data.display_name;
        if (callback) callback(data);
      });
  }

  // --- Sample points inside polygon ---
  function samplePolygonPoints(latlngs, step = 0.01) { // 0.01° ~ 1 km
    const lats = latlngs.map(p => p.lat);
    const lons = latlngs.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const points = [];

    for (let lat = minLat; lat <= maxLat; lat += step) {
      for (let lon = minLon; lon <= maxLon; lon += step) {
        if (pointInPolygon([lat, lon], latlngs)) points.push({ lat, lon });
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

  // --- Fetch weather for polygon points ---
async function fetchClimatePolygon(latlngs) {
  let step = 0.09; // ~1 km
  let points = samplePolygonPoints(latlngs, step);

  // Expand search radius until at least one data point returns climate data
  let attempt = 0;
  while (points.length < 1 && attempt < 5) {
    step += 0.01; // expand ~1 km
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

  // fallback to centroid if still no points
  if (points.length === 0) {
    const centroid = {
      lat: latlngs.reduce((sum, p) => sum + p.lat, 0) / latlngs.length,
      lon: latlngs.reduce((sum, p) => sum + p.lng, 0) / latlngs.length
    };
    points.push(centroid);
  }

  const tempsMax = [], tempsMin = [], tempsMean = [];
  const precip = [], wind = [], frost = [], solar = [];

  for (let p of points) {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,windgusts_10m,frost_days,shortwave_radiation_sum&timezone=auto&temperature_unit=celsius&windspeed_unit=kmh&precipitation_unit=mm`);
      const data = await res.json();
      const daily = data.daily;
      if (!daily) continue;
      tempsMax.push(daily.temperature_2m_max[0]);
      tempsMin.push(daily.temperature_2m_min[0]);
      tempsMean.push(daily.temperature_2m_mean[0]);
      precip.push(daily.precipitation_sum[0]);
      wind.push(daily.windgusts_10m[0]);
      frost.push(daily.frost_days[0]);
      solar.push(daily.shortwave_radiation_sum[0]);
    } catch(e) { console.error(e); }
  }

  const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1) : '—';

  document.getElementById('previewClimateSidebar').textContent = `
Polygon Climate Analysis:
  Avg Max Temp: ${avg(tempsMax)}°C
  Avg Min Temp: ${avg(tempsMin)}°C
  Avg Mean Temp: ${avg(tempsMean)}°C
  Avg Precipitation: ${avg(precip)} mm
  Avg Wind Gust: ${avg(wind)} km/h
  Avg Frost Days: ${avg(frost)}
  Avg Solar Radiation: ${avg(solar)} W/m²
`;
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
    } else marker.setLatLng(latlng);

    updateCoords(latlng);
    reverseGeocode(latlng.lat, latlng.lng);
    fetchClimatePolygon([{lat: latlng.lat, lng: latlng.lng}]);
  }

  map.on('click', e => setupMarker(e.latlng));

  const drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: { marker: false, circle: false, polyline: false, rectangle: true, polygon: true }
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
    document.getElementById('previewName').textContent = document.getElementById('plotName').value || '—';
    document.getElementById('previewType').textContent = document.getElementById('plotType').value || '—';
    const areaVal = document.getElementById('plotArea').value;
    document.getElementById('previewArea').textContent = areaVal ? areaVal + ' m²' : '—';
    document.getElementById('previewLocation').textContent = document.getElementById('plotLocation').value || '—';
    document.getElementById('previewPerimeter').textContent = document.getElementById('previewPerimeter').textContent || '—';
  });

});