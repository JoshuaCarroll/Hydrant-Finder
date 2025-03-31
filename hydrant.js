let currentHeading = null;
let hydrantBearing = null;
let lastLat = null;
let lastLon = null;
let lastHydrant = null;
let lastLatLon = null;
const DISTANCE_THRESHOLD = 50; // meters

function toRadians(deg) { return deg * Math.PI / 180; }
function toDegrees(rad) { return rad * 180 / Math.PI; }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = toRadians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRadians(lat2));
  const x = Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
            Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(dLon);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function rotateArrow() {
  if (currentHeading === null || hydrantBearing === null) return;
  const relativeAngle = (hydrantBearing - currentHeading + 360) % 360;
  document.getElementById('arrow').style.transform = `rotate(${relativeAngle}deg)`;
}

function handleOrientation(event) {
  if (event.absolute || event.webkitCompassHeading) {
    currentHeading = event.webkitCompassHeading;
  } else if (event.alpha !== null) {
    currentHeading = 360 - event.alpha;
  }
  rotateArrow();
}

function requestOrientationAccess() {
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(response => {
      if (response === 'granted') {
        window.addEventListener('deviceorientation', handleOrientation, true);
      } else {
        alert("Permission denied for compass.");
      }
    });
  } else {
    window.addEventListener('deviceorientation', handleOrientation, true);
  }
}

async function findNearestHydrant(lat, lon) {
  const url = new URL('https://services1.arcgis.com/wuUHGjgeUTzbEp4y/ArcGIS/rest/services/Hydrant/FeatureServer/0/query');
  url.search = new URLSearchParams({
    f: 'json',
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: '500',
    units: 'esriSRUnit_Meter',
    outFields: '*',
    returnGeometry: 'true',
    resultRecordCount: '10'
  });

  const response = await fetch(url);
  const data = await response.json();

  if (!data.features || data.features.length === 0) {
    document.getElementById('status').innerText = 'No hydrants found nearby.';
    return null;
  }

  let closest = null;
  let minDistance = Infinity;

  for (const feature of data.features) {
    const hydrantLat = feature.geometry.y;
    const hydrantLon = feature.geometry.x;
    const distMeters = haversine(lat, lon, hydrantLat, hydrantLon);
    if (distMeters < minDistance) {
      minDistance = distMeters;
      closest = {
        id: feature.attributes.OBJECTID,
        latitude: hydrantLat,
        longitude: hydrantLon,
        distance_meters: distMeters,
        distance_feet: distMeters * 3.28084,
        distance_miles: distMeters * 0.000621371,
        bearing_deg: calculateBearing(lat, lon, hydrantLat, hydrantLon)
      };
    }
  }

  document.getElementById('info').innerText =
    `Hydrant is ${closest.distance_feet.toFixed(0)} ft away at ${closest.bearing_deg.toFixed(0)}°`;
  hydrantBearing = closest.bearing_deg;
  rotateArrow();
  return closest;
}

function startTracking() {
  if (!navigator.geolocation) {
    document.getElementById('status').innerText = 'Geolocation not supported.';
    return;
  }

	navigator.geolocation.watchPosition(async (pos) => {
		const lat = pos.coords.latitude;
		const lon = pos.coords.longitude;

		// Recalculate distance every time
		if (lastHydrant) {
			const newDistance = haversine(lat, lon, lastHydrant.latitude, lastHydrant.longitude);
			document.getElementById('info').innerText =
				`Hydrant is ${Math.round(newDistance * 3.28084)} ft away at ${lastHydrant.bearing_deg.toFixed(0)}°`;
		}

		// Re-fetch hydrant only if moved more than 50 meters
		if (!lastLatLon || haversine(lat, lon, lastLatLon.lat, lastLatLon.lon) > DISTANCE_THRESHOLD) {
			lastHydrant = await findNearestHydrant(lat, lon);
			lastLatLon = { lat, lon };
			if (lastHydrant) {
				document.getElementById('info').innerText =
					`Hydrant is ${Math.round(lastHydrant.distance_feet)} ft away at ${lastHydrant.bearing_deg.toFixed(0)}°`;
			}
		}
	}, (err) => {
		console.error("Geolocation error", err);
	}, { enableHighAccuracy: true });
}

startTracking();
