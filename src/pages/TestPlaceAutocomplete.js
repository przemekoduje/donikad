import React, { useState } from "react";
import PlaceAutocompleteInput from "../components/maps/PlaceAutocompleteInput"; // ścieżka zależy od struktury

export default function TestPlaceAutocomplete() {
  const [origin, setOrigin] = useState(null);

  return (
    <div>
      <PlaceAutocompleteInput
        placeholder="Wybierz miejsce początkowe"
        onPlaceSelected={place => {
          if (place && place.geometry && place.geometry.location) {
            setOrigin({
              lat: place.geometry.location.lat,
              lng: place.geometry.location.lng,
              address: place.formatted_address,
            });
          }
        }}
      />
      {origin && (
        <div>
          <b>Wybrany punkt:</b> {origin.address} ({origin.lat}, {origin.lng})
        </div>
      )}
    </div>
  );
}
