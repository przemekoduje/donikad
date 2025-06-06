import React, { useEffect, useRef } from "react";

export default function PlaceAutocompleteInput({ placeholder = "Podaj miejsce...", onPlaceSelected }) {
  const ref = useRef(null);
  const elementRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        window.google &&
        window.google.maps &&
        window.google.maps.places &&
        ref.current &&
        !elementRef.current
      ) {
        const element = document.createElement("gmpx-place-autocomplete");
        element.setAttribute("placeholder", placeholder);
        element.style.width = "100%";
        element.style.height = "40px";
        element.style.minHeight = "40px";
        ref.current.appendChild(element);
        elementRef.current = element;

        element.addEventListener("gmpx-placeautocomplete-placechange", (event) => {
          if (onPlaceSelected && event.detail && event.detail.place) {
            onPlaceSelected(event.detail.place);
          }
        });
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      if (ref.current && elementRef.current) {
        ref.current.removeChild(elementRef.current);
        elementRef.current = null;
      }
    };
  }, [placeholder, onPlaceSelected]);

  return <div ref={ref} style={{ minHeight: 400, width: "100%" }} />;
}
