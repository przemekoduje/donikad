import React, { useRef, useState, useEffect } from "react";
import { GoogleMap, LoadScript, DirectionsService, DirectionsRenderer } from "@react-google-maps/api";
import axios from "axios";

const containerStyle = { width: "100%", height: "400px" };
const defaultCenter = { lat: 50.2945, lng: 18.6714 };
const libraries = ["places"];

// Komponent pojedynczego pola adresu: działa jako PlaceAutocompleteBox albo fallback-input
function PlaceInputWithFallback({ onPlaceSelected, placeholder }) {
  const ref = useRef(null);
  const elementRef = useRef(null);
  const [fallback, setFallback] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);




  // Sprawdź czy webcomponent jest dostępny (tylko po załadowaniu window.google)
  useEffect(() => {
    const check = () => {
      if (
        window.google &&
        window.google.maps &&
        window.google.maps.places &&
        ref.current &&
        !elementRef.current
      ) {
        // Test czy webcomponent jest zarejestrowany
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
        // Jeśli nie ma webcomponentu — fallback!
        setFallback(true);
      }
    };
    // Odczekaj, bo czasem google jest ładowane asynchronicznie
    const timer = setTimeout(check, 400);
    return () => {
      clearTimeout(timer);
      if (ref.current && elementRef.current) {
        ref.current.removeChild(elementRef.current);
        elementRef.current = null;
      }
    };
  }, [onPlaceSelected, placeholder]);

  // Ręczne geokodowanie dla fallback-input
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
        // Podaj w "syntetycznym" formacie podobnym do Place
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

  // Jeśli fallback — pokazujemy input + przycisk "Szukaj"
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

  // Wersja z webcomponentem
  return <div ref={ref} />;
}

export default function RouteMap() {
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [directions, setDirections] = useState(null);
  const [towns, setTowns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [directionsRequest, setDirectionsRequest] = useState(null);

  // Odczytaj współrzędne z obiektu place (API gmpx lub fallback)
  const extractCoords = (place) => {
    if (place && place.geometry && place.geometry.location) {
      const loc = place.geometry.location;
      // location może być funkcją (webcomponent) lub liczbą (fallback)
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
    setDirections(null); // Resetuj trasę, gdy zmieniasz punkt!
    setTowns([]);
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
    setTowns([]);
    if (origin && coords) {
      setDirectionsRequest({
        origin,
        destination: coords,
        travelMode: "DRIVING",
      });
    }
  };

  const shouldShowDirections = origin && destination;

  const handleDirectionsCallback = async (res) => {
    if (res !== null && res.status === "OK") {
      setDirections(res);
      setDirectionsRequest(null);
      setLoading(true);

      const steps = res.routes[0].legs[0].steps;
      const stepIndexes = Array.from({ length: steps.length }, (_, i) => i).filter(i => i % 5 === 0 || i === steps.length - 1);
      const points = stepIndexes.map(i => steps[i].end_location);

      const townsArr = [];
      for (let pt of points) {
        try {
          const lat = typeof pt.lat === "function" ? pt.lat() : pt.lat;
          const lng = typeof pt.lng === "function" ? pt.lng() : pt.lng;
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}&language=pl`;
          const resp = await axios.get(url);
          const cityResult = resp.data.results.find(r =>
            r.types.includes("locality") ||
            r.types.includes("administrative_area_level_2") ||
            r.types.includes("postal_town")
          );
          if (cityResult) {
            const component = cityResult.address_components.find(c =>
              c.types.includes("locality") ||
              c.types.includes("administrative_area_level_2") ||
              c.types.includes("postal_town")
            );
            if (component) townsArr.push(component.long_name);
          }
        } catch (e) {
          // Możesz logować błędy geokodowania jeśli chcesz
        }
      }
      const uniqueTowns = [...new Set(townsArr.filter(Boolean))];
      setTowns(uniqueTowns);
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
          <h3 style={{ marginTop: 0 }}>Miejscowości na trasie:</h3>
          {loading && <span>Wyszukuję miejscowości...</span>}
          {!loading && towns.length > 0 && (
            <ul>
              {towns.map((town, idx) => (
                <li key={idx}>{town}</li>
              ))}
            </ul>
          )}
          {!loading && towns.length === 0 && shouldShowDirections && (
            <span>Brak danych lub nie wyznaczono trasy.</span>
          )}
        </div>
      </div>
    </LoadScript>
  );
}
