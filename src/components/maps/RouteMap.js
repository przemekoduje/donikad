import React, { useState, useRef } from "react";
import { GoogleMap, LoadScript, DirectionsService, DirectionsRenderer, Autocomplete } from "@react-google-maps/api";
import axios from "axios";

const containerStyle = { width: "100%", height: "400px" };
const defaultCenter = { lat: 50.2945, lng: 18.6714 }; // np. Gliwice

export default function RouteMap() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originCoords, setOriginCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [directions, setDirections] = useState(null);
  const [towns, setTowns] = useState([]);
  const [loading, setLoading] = useState(false);

  const originAutocomplete = useRef(null);
  const destinationAutocomplete = useRef(null);

  // Obsługa wyboru miejsca (z Autocomplete)
  const handlePlaceChanged = (which) => {
    const autocomplete = which === "origin" ? originAutocomplete.current : destinationAutocomplete.current;
    const place = autocomplete.getPlace();
    if (place && place.geometry) {
      const coords = {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      };
      if (which === "origin") {
        setOrigin(place.formatted_address);
        setOriginCoords(coords);
      } else {
        setDestination(place.formatted_address);
        setDestinationCoords(coords);
      }
    }
  };

  // Wywołanie Directions tylko gdy oba punkty są wybrane
  const shouldShowDirections = originCoords && destinationCoords;

  // Callback DirectionsService
  const handleDirectionsCallback = async (res) => {
    if (res !== null && res.status === "OK") {
      setDirections(res);
      setLoading(true);

      // Kroki trasy (steps)
      const steps = res.routes[0].legs[0].steps;
      const stepIndexes = Array.from({length: steps.length}, (_, i) => i).filter(i => i % 5 === 0 || i === steps.length - 1);
      const points = stepIndexes.map(i => steps[i].end_location);

      // Reverse geocoding
      const townsArr = [];
      for (let pt of points) {
        try {
          const lat = pt.lat();
          const lng = pt.lng();
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
          // console.warn("Błąd geocodingu:", e);
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
      libraries={["places"]}
    >
      <div style={{margin: "30px auto", maxWidth: 900}}>
        <div style={{display: "flex", gap: 12, marginBottom: 14}}>
          <Autocomplete
            onLoad={ref => (originAutocomplete.current = ref)}
            onPlaceChanged={() => handlePlaceChanged("origin")}
          >
            <input
              type="text"
              placeholder="Punkt początkowy (np. Gliwice)"
              value={origin}
              onChange={e => setOrigin(e.target.value)}
              style={{width: 240, padding: 8, fontSize: 16}}
            />
          </Autocomplete>
          <Autocomplete
            onLoad={ref => (destinationAutocomplete.current = ref)}
            onPlaceChanged={() => handlePlaceChanged("destination")}
          >
            <input
              type="text"
              placeholder="Punkt końcowy (np. Nowy Sącz)"
              value={destination}
              onChange={e => setDestination(e.target.value)}
              style={{width: 240, padding: 8, fontSize: 16}}
            />
          </Autocomplete>
        </div>

        <GoogleMap
          mapContainerStyle={containerStyle}
          center={originCoords || defaultCenter}
          zoom={7}
        >
          {shouldShowDirections && (
            <DirectionsService
              options={{
                destination: destinationCoords,
                origin: originCoords,
                travelMode: "DRIVING",
              }}
              callback={handleDirectionsCallback}
            />
          )}
          {directions && <DirectionsRenderer directions={directions} />}
        </GoogleMap>
        <div style={{marginTop: 20, background: "#f6f7fa", padding: 18, borderRadius: 12, minHeight: 80}}>
          <h3 style={{marginTop: 0}}>Miejscowości na trasie:</h3>
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
