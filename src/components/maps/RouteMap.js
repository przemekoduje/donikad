import React, { useRef, useState, useEffect } from "react";
import { GoogleMap, LoadScript, DirectionsService, DirectionsRenderer } from "@react-google-maps/api";
import axios from "axios";

const containerStyle = { width: "100%", height: "400px" };
const defaultCenter = { lat: 50.2945, lng: 18.6714 };
const libraries = ["places"];

// Komponent pojedynczego pola adresu
function PlaceInputWithFallback({ onPlaceSelected, placeholder }) {
  const ref = useRef(null);
  const elementRef = useRef(null);
  const [fallback, setFallback] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  useEffect(() => {
    const check = () => {
      if (
        window.google &&
        window.google.maps &&
        window.google.maps.places &&
        ref.current &&
        !elementRef.current
      ) {
        const available = !!window.customElements.get("gmpx-place-autocomplete");
        if (available) {
          const element = document.createElement("gmpx-place-autocomplete");
          element.setAttribute("placeholder", placeholder || "Wyszukaj miejsce...");
          element.style.width = "240px";
          element.style.height = "40px";
          element.style.minHeight = "40px";
          element.style.display = "block";
          element.style.border = "1px solid #aaa";
          ref.current.appendChild(element);
          elementRef.current = element;

          element.addEventListener("gmpx-placeautocomplete-placechange", (event) => {
            if (event.detail && event.detail.place) {
              onPlaceSelected(event.detail.place);
            }
          });

          return;
        }
        setFallback(true);
      }
    };
    const timer = setTimeout(check, 400);
    return () => {
      clearTimeout(timer);
      if (ref.current && elementRef.current) {
        ref.current.removeChild(elementRef.current);
        elementRef.current = null;
      }
    };
  }, [onPlaceSelected, placeholder]);

  const handleGeocode = async () => {
    if (!manualAddress) return;
    setIsGeocoding(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(manualAddress)}&key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}&language=pl`;
      const resp = await axios.get(url);
      if (
        resp.data.status === "OK" &&
        resp.data.results &&
        resp.data.results[0] &&
        resp.data.results[0].geometry
      ) {
        const result = resp.data.results[0];
        onPlaceSelected({
          formatted_address: result.formatted_address,
          geometry: {
            location: {
              lat: result.geometry.location.lat,
              lng: result.geometry.location.lng,
            },
          },
        });
      } else {
        alert("Nie znaleziono lokalizacji dla podanego adresu.");
      }
    } catch (e) {
      alert("Błąd geokodowania!");
    }
    setIsGeocoding(false);
  };

  if (fallback) {
    return (
      <div style={{ width: 240 }}>
        <input
          type="text"
          value={manualAddress}
          onChange={e => setManualAddress(e.target.value)}
          placeholder={placeholder}
          style={{ width: "100%", height: 40, fontSize: 16, padding: 6, border: "1px solid #aaa", borderRadius: 8 }}
        />
        <button
          type="button"
          style={{ marginTop: 6, width: "100%", height: 34, borderRadius: 8 }}
          onClick={handleGeocode}
          disabled={isGeocoding}
        >
          {isGeocoding ? "Szukam..." : "Ustaw punkt"}
        </button>
      </div>
    );
  }

  return <div ref={ref} />;
}

export default function RouteMap() {
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [directions, setDirections] = useState(null);
  const [loading, setLoading] = useState(false);
  const [directionsRequest, setDirectionsRequest] = useState(null);
  const [osmTowns, setOsmTowns] = useState([]);

  const extractCoords = (place) => {
    if (place && place.geometry && place.geometry.location) {
      const loc = place.geometry.location;
      return {
        lat: typeof loc.lat === "function" ? loc.lat() : loc.lat,
        lng: typeof loc.lng === "function" ? loc.lng() : loc.lng,
        address: place.formatted_address || place.name || "",
      };
    }
    return null;
  };

  const handleSetOrigin = (place) => {
    const coords = extractCoords(place);
    setOrigin(coords);
    setDirections(null);
    setOsmTowns([]);
    if (coords && destination) {
      setDirectionsRequest({
        origin: coords,
        destination,
        travelMode: "DRIVING",
      });
    }
  };
  const handleSetDestination = (place) => {
    const coords = extractCoords(place);
    setDestination(coords);
    setDirections(null);
    setOsmTowns([]);
    if (origin && coords) {
      setDirectionsRequest({
        origin,
        destination: coords,
        travelMode: "DRIVING",
      });
    }
  };

  // Helper: wybiera co N-ty punkt z polyline
  function selectEveryNth(arr, n) {
    return arr.filter((_, idx) => idx % n === 0);
  }

  // OSM: pobierz miejscowości dla punktu
  async function getNearbyTowns(lat, lng, radius = 30000) {
    const query = `
    [out:json][timeout:25];
    (
      node["place"~"city|town|village|hamlet"](around:${radius},${lat},${lng});
    );
    out body;
  `;
    const url = "https://overpass-api.de/api/interpreter";
    const resp = await axios.post(url, query, { headers: { 'Content-Type': 'text/plain' } });
    if (resp.data && resp.data.elements) {
      return resp.data.elements.map(el => ({
        id: el.id,
        name: el.tags.name,
        lat: el.lat,
        lng: el.lon,
        type: el.tags.place,
      }));
    }
    return [];
  }

  // OSM: pobierz miejscowości dla całej trasy
  async function getAllNearbyTownsAlongRoute(points) {
    let allTowns = [];
    for (let pt of points) {
      const towns = await getNearbyTowns(pt.lat, pt.lng, 30000);
      allTowns = allTowns.concat(towns);
      // await new Promise(r => setTimeout(r, 250)); // Możesz dodać throttling!
    }
    const uniqueTowns = Array.from(new Map(allTowns.map(item => [item.name, item])).values());
    return uniqueTowns;
  }

  // Callback DirectionsService (z OSM towns)
  const handleDirectionsCallback = async (res) => {
    if (res !== null && res.status === "OK") {
      setDirections(res);
      setDirectionsRequest(null);
      setLoading(true);

      // Wydziel punkty polyline co 10 fragmentów
      const polylinePoints = res.routes[0].overview_path.map(latlng => ({
        lat: typeof latlng.lat === "function" ? latlng.lat() : latlng.lat,
        lng: typeof latlng.lng === "function" ? latlng.lng() : latlng.lng,
      }));
      const queryPoints = selectEveryNth(polylinePoints, Math.floor(polylinePoints.length / 10) || 1);

      // Pobierz miejscowości OSM (asynchronicznie)
      const uniqueTowns = await getAllNearbyTownsAlongRoute(queryPoints);
      setOsmTowns(uniqueTowns);
      setLoading(false);
    }
  };

  return (
    <LoadScript
      googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
      libraries={libraries}
      language="pl"
    >
      <div style={{ margin: "30px auto", maxWidth: 900 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <PlaceInputWithFallback
            placeholder="Punkt początkowy (np. Gliwice)"
            onPlaceSelected={handleSetOrigin}
          />
          <PlaceInputWithFallback
            placeholder="Punkt końcowy (np. Nowy Sącz)"
            onPlaceSelected={handleSetDestination}
          />
        </div>
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={origin || defaultCenter}
          zoom={7}
        >
          {directionsRequest && (
            <DirectionsService
              options={directionsRequest}
              callback={handleDirectionsCallback}
            />
          )}
          {directions && <DirectionsRenderer directions={directions} />}
        </GoogleMap>
        <div style={{ marginTop: 20, background: "#f6f7fa", padding: 18, borderRadius: 12, minHeight: 80 }}>
          <h3 style={{ marginTop: 0 }}>Miejscowości w promieniu 30 km od trasy:</h3>
          {loading && <span>Wyszukuję miejscowości...</span>}
          {!loading && osmTowns.length > 0 && (
            <ul>
              {osmTowns.map((town) => (
                <li key={town.id}>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${town.lat}&mlon=${town.lng}#map=11/${town.lat}/${town.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {town.name} ({town.type})
                  </a>
                </li>
              ))}
            </ul>
          )}
          {!loading && osmTowns.length === 0 && (
            <span>Brak danych lub nie wyznaczono trasy.</span>
          )}
        </div>
      </div>
    </LoadScript>
  );
}
