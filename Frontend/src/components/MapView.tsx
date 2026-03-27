import {
  MapContainer,
  TileLayer,
  Circle,
  Polygon,
  Tooltip,
  Polyline,
  Marker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import "./MapView.css";
import type { DroneEvent, Sensor } from "../App";

type Drone = {
  position: [number, number];
};

type Props = {
  myPosition: [number, number];
  sensors: Sensor[];
  drone: Drone;
  confidence: number;
  history: DroneEvent[];
};

function RecenterMap({ position }: { position: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(position, map.getZoom(), {
      animate: true,
    });
  }, [position, map]);

  return null;
}

// Triângulo do drone
function droneTriangle([lat, lng]: [number, number]): [number, number][] {
  const sz = 0.0007;
  return [
    [lat + sz, lng],
    [lat - sz * 0.6, lng - sz * 0.7],
    [lat - sz * 0.6, lng + sz * 0.7],
  ];
}

// Distância simples entre 2 pontos
function distanceBetween(a: [number, number], b: [number, number]) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.hypot(dx, dy);
}

// Constrói caminho por proximidade:
// eu -> sensor mais próximo -> próximo dele -> etc.
function buildNearestNeighborPath(
  myPosition: [number, number],
  sensors: Sensor[]
): [number, number][] {
  const remaining = sensors
    .filter((s) => s.status === "online")
    .map((s) => s.position);

  const path: [number, number][] = [myPosition];
  let current = myPosition;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = distanceBetween(current, remaining[0]);

    for (let i = 1; i < remaining.length; i++) {
      const d = distanceBetween(current, remaining[i]);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearestIndex = i;
      }
    }

    const [nearest] = remaining.splice(nearestIndex, 1);
    path.push(nearest);
    current = nearest;
  }

  return path;
}

// Ícone da tua posição
const myIcon = L.divIcon({
  className: "my-location-icon",
  html: `<div class="my-location-dot"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Zonas de perigo em torno da tua posição
const DANGER_ZONES = [
  { radius: 150, color: "#ff4040", opacity: 0.16, label: "HOT ZONE" },
  { radius: 350, color: "#ff8800", opacity: 0.1, label: "CAUTION" },
  { radius: 600, color: "#ffbe00", opacity: 0.06, label: "MONITOR" },
];

const MapView = ({ myPosition, sensors, drone, confidence, history }: Props) => {
  const trail: [number, number][] = [
    ...history.slice(0, 8).map((e) => e.position).reverse(),
    drone.position,
  ];

  const formationPoints = buildNearestNeighborPath(myPosition, sensors);

  return (
    <div className="map-container">
      <div className="map-compass">
        <div className="compass-ring">
          <span className="dir n">N</span>
          <span className="dir e">E</span>
          <span className="dir s">S</span>
          <span className="dir w">O</span>
          <div className="needle" />
        </div>
      </div>

      <MapContainer
        center={myPosition}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        attributionControl={false}
      >
        <RecenterMap position={myPosition} />

        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        {/* Polígono fechado entre devices por proximidade */}
        {formationPoints.length >= 3 && (
          <Polygon
            positions={formationPoints}
            pathOptions={{
              color: "#00ff50",
              weight: 1.4,
              opacity: 0.65,
              dashArray: "6 6",
              fillOpacity: 0,
            }}
          >
            <Tooltip sticky className="map-tooltip">
              TEAM LINK MESH
            </Tooltip>
          </Polygon>
        )}

        {/* Minha posição */}
        <Marker position={myPosition} icon={myIcon}>
          <Tooltip permanent direction="top" offset={[0, -10]} className="map-tooltip">
            EU
          </Tooltip>
        </Marker>

        {/* Zonas de perigo */}
        {[...DANGER_ZONES].reverse().map((z) => (
          <Circle
            key={z.radius}
            center={myPosition}
            radius={z.radius}
            pathOptions={{
              color: z.color,
              fillColor: z.color,
              fillOpacity: z.opacity,
              weight: 1,
              dashArray: z.radius === 150 ? undefined : "4 4",
            }}
          >
            <Tooltip sticky className="map-tooltip map-tooltip--warn">
              {z.label} — r{z.radius}m
            </Tooltip>
          </Circle>
        ))}

        {/* Sensores / parceiros */}
        {sensors.map((sensor) => (
          <Circle
            key={sensor.id}
            center={sensor.position}
            radius={55}
            pathOptions={{
              color: sensor.status === "online" ? "#00ff50" : "#ff4040",
              fillColor: sensor.status === "online" ? "#00ff50" : "#ff4040",
              fillOpacity: 0.16,
              weight: 1.5,
            }}
          >
            <Tooltip permanent direction="right" offset={[10, 0]} className="map-tooltip">
              {sensor.id}
            </Tooltip>
          </Circle>
        ))}

        {/* Trail do drone */}
        {trail.length > 1 && (
          <Polyline
            positions={trail}
            pathOptions={{
              color: "#ff4040",
              weight: 1.5,
              opacity: 0.4,
              dashArray: "3 5",
            }}
          />
        )}

        {/* Drone */}
        <Polygon
          positions={droneTriangle(drone.position)}
          pathOptions={{
            color: "#ff4040",
            fillColor: "#ff4040",
            fillOpacity: 0.75,
            weight: 1.5,
          }}
        >
          <Tooltip sticky className="map-tooltip map-tooltip--danger">
            BOGEY-1 · CONF {Math.round(confidence * 100)}%
          </Tooltip>
        </Polygon>

        {/* Ghost positions históricos */}
        {history.slice(0, 6).map((evt, i) => (
          <Circle
            key={evt.id}
            center={evt.position}
            radius={18}
            pathOptions={{
              color: "#ff4040",
              fillColor: "#ff4040",
              fillOpacity: 0.08 + i * 0.02,
              weight: 0.5,
              dashArray: "2 3",
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
};

export default MapView;