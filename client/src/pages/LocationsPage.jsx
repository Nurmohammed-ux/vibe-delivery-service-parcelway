import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import branchLocations from "../data/branch-locations.json";
import "leaflet/dist/leaflet.css";

const regions = [...new Set(branchLocations.map(({ region }) => region))];

const branchMarkerIcon = L.icon({
  iconRetinaUrl: markerIconRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export function LocationsPage() {
  const [selectedRegion, setSelectedRegion] = useState("all");
  const [search, setSearch] = useState("");
  const [focusedLocation, setFocusedLocation] = useState(null);
  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return branchLocations.filter((location) => {
      const matchesRegion =
        selectedRegion === "all" || location.region === selectedRegion;
      const searchableText = [
        location.region,
        location.district,
        location.city,
        ...location.coveredAreas,
      ]
        .join(" ")
        .toLowerCase();
      return matchesRegion && (!query || searchableText.includes(query));
    });
  }, [search, selectedRegion]);

  function updateRegion(event) {
    setSelectedRegion(event.target.value);
    setFocusedLocation(null);
  }

  function updateSearch(event) {
    setSearch(event.target.value);
    setFocusedLocation(null);
  }

  return (
    <section className="content-page locations-page">
      <header className="locations-heading">
        <div>
          <span className="eyebrow">OUR COVERAGE</span>
          <h1>Find a Parcelway location</h1>
          <p className="page-intro">
            Explore {branchLocations.length} service locations across {regions.length} regions.
            Select a map marker to see its nearby covered areas.
          </p>
        </div>
        <div className="locations-summary" aria-label="Coverage summary">
          <span><strong>{branchLocations.length}</strong> locations</span>
          <span><strong>{regions.length}</strong> regions</span>
        </div>
      </header>

      <p className="locations-accuracy-note" role="note">
        Map markers show approximate district-level service locations, not
        confirmed branch entrances.
      </p>

      <div className="locations-toolbar">
        <label>
          <span>Filter by region</span>
          <select
            className="input input-bordered"
            onChange={updateRegion}
            value={selectedRegion}
          >
            <option value="all">All regions</option>
            {regions.map((region) => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Search locations</span>
          <input
            className="input input-bordered"
            onChange={updateSearch}
            placeholder="Region, district, or covered area"
            type="search"
            value={search}
          />
        </label>
        <p aria-live="polite">
          Showing <strong>{filteredLocations.length}</strong> of {branchLocations.length}
        </p>
      </div>

      <div className="locations-layout">
        <div
          className="locations-map"
          role="region"
          aria-label="Interactive map of Parcelway service locations"
        >
          <MapContainer
            center={[23.685, 90.3563]}
            maxZoom={13}
            minZoom={5}
            scrollWheelZoom={false}
            zoom={7}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitMapToLocations locations={filteredLocations} />
            {filteredLocations.map((location) => (
              <BranchMarker
                focused={focusedLocation === getLocationKey(location)}
                key={getLocationKey(location)}
                location={location}
              />
            ))}
          </MapContainer>
        </div>

        <aside className="locations-list" aria-label="Service locations">
          <h2>Service locations</h2>
          {filteredLocations.length ? (
            <ul>
              {filteredLocations.map((location) => {
                const key = getLocationKey(location);
                return (
                  <li key={key}>
                    <button
                      aria-pressed={focusedLocation === key}
                      className={`location-result${focusedLocation === key ? " location-result-focused" : ""}`}
                      onClick={() => setFocusedLocation(key)}
                      type="button"
                    >
                      <span className="location-result-heading">
                        <strong>{location.city}</strong>
                        <span className={`location-status location-status-${location.status}`}>
                          {location.status}
                        </span>
                      </span>
                      <span className="location-result-region">
                        {location.district} district · {location.region} region
                      </span>
                      <span className="location-result-areas">
                        {location.coveredAreas.length} nearby covered areas
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="locations-empty">No locations match your search.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function FitMapToLocations({ locations }) {
  const map = useMap();

  useEffect(() => {
    if (!locations.length) return;

    const points = locations.map(({ latitude, longitude }) => [
      latitude,
      longitude,
    ]);
    if (points.length === 1) {
      map.setView(points[0], 10);
      return;
    }

    map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 8 });
  }, [locations, map]);

  return null;
}

function BranchMarker({ focused, location }) {
  const markerRef = useRef(null);
  const map = useMap();

  useEffect(() => {
    if (!focused) return;

    const position = [location.latitude, location.longitude];
    map.flyTo(position, Math.max(map.getZoom(), 9), { duration: 0.4 });
    markerRef.current?.openPopup();
  }, [focused, location, map]);

  return (
    <Marker
      icon={branchMarkerIcon}
      position={[location.latitude, location.longitude]}
      ref={markerRef}
    >
      <Popup>
        <div className="location-popup">
          <strong>{location.city}</strong>
          <span>{location.district} district · {location.region} region</span>
          <p>Nearby covered areas</p>
          <ul>
            {location.coveredAreas.map((area) => <li key={area}>{area}</li>)}
          </ul>
          <span className={`location-status location-status-${location.status}`}>
            {location.status}
          </span>
        </div>
      </Popup>
    </Marker>
  );
}

function getLocationKey(location) {
  return `${location.region}-${location.district}`;
}
