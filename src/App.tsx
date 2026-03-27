import { useMemo, useState, useEffect, useCallback } from "react";
import Alerts from "./components/Alerts";
import SensorStatus from "./components/SensorStatus";
import MapView from "./components/MapView";
import DroneHistory from "./components/DroneHistory";
import "./App.css";
import {
  estimateDronePositionFromDetections,
  type DetectionMessage,
} from "./utils/tdoa";

export type Sensor = {
  id: string;
  status: "online" | "offline";
  position: [number, number];
};

export type DroneData = {
  drone: boolean;
  confidence: number;
  direction: number;
  alert: boolean;
  sensors: Sensor[];
  dronePosition: [number, number];
  myPosition: [number, number];
};

export type DroneEvent = {
  id: number;
  timestamp: Date;
  position: [number, number];
  confidence: number;
};

const SOUND_SPEED = 343;

function toRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

function metersToLatLngOffset(
  northMeters: number,
  eastMeters: number,
  refLat: number
): [number, number] {
  const dLat = northMeters / 111320;
  const dLng = eastMeters / (111320 * Math.cos(toRadians(refLat)));
  return [dLat, dLng];
}

function point300mWestOf(position: [number, number]): [number, number] {
  const [lat, lng] = position;
  const [, dLng] = metersToLatLngOffset(0, -300, lat);
  return [lat, lng + dLng];
}

function latLngToLocalMeters(
  latitude: number,
  longitude: number,
  refLat: number,
  refLng: number
) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(toRadians(refLat));

  return {
    x: (longitude - refLng) * metersPerDegLng,
    y: (latitude - refLat) * metersPerDegLat,
  };
}

function distanceMeters(
  a: [number, number],
  b: [number, number],
  refLat: number,
  refLng: number
) {
  const pa = latLngToLocalMeters(a[0], a[1], refLat, refLng);
  const pb = latLngToLocalMeters(b[0], b[1], refLat, refLng);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

function App() {
  const [data, setData] = useState<DroneData>({
    drone: true,
    confidence: 0.87,
    direction: 120,
    alert: true,
    sensors: [
      { id: "EchoShield_Node_Alpha", status: "online", position: [38.7223, -9.1393] },
      { id: "EchoShield_Node_Beta", status: "online", position: [38.72165, -9.1411] },
      { id: "EchoShield_Node_Gamma", status: "online", position: [38.72085, -9.13855] },
      { id: "EchoShield_Node_Delta", status: "online", position: [38.72305, -9.14005] },
      { id: "EchoShield_Node_Epsilon", status: "online", position: [38.7211, -9.1422] },
    ],
    dronePosition: [38.72155, -9.1401],
    myPosition: [38.722, -9.1418],
  });

  const [history, setHistory] = useState<DroneEvent[]>([
    {
      id: 1,
      timestamp: new Date(Date.now() - 4 * 60000),
      position: [38.7212, -9.1406],
      confidence: 0.91,
    },
    {
      id: 2,
      timestamp: new Date(Date.now() - 2 * 60000),
      position: [38.72135, -9.14035],
      confidence: 0.85,
    },
    {
      id: 3,
      timestamp: new Date(Date.now() - 60000),
      position: [38.72148, -9.14018],
      confidence: 0.88,
    },
  ]);

  const [time, setTime] = useState(new Date());
  const [eventCounter, setEventCounter] = useState(4);
  const [detections, setDetections] = useState<DetectionMessage[]>([]);

  const addDetection = useCallback((msg: DetectionMessage) => {
    setDetections((prev) => [...prev, msg].slice(-200));
  }, []);

  const estimatedDrone = useMemo(() => {
    if (detections.length < 3) return null;

    const byAnalysis = new Map<number, DetectionMessage[]>();

    for (const det of detections) {
      const list = byAnalysis.get(det.analysis_id) ?? [];
      list.push(det);
      byAnalysis.set(det.analysis_id, list);
    }

    if (byAnalysis.size === 0) return null;

    const latestAnalysisId = Math.max(...Array.from(byAnalysis.keys()));
    const latestDetections = byAnalysis.get(latestAnalysisId) ?? [];

    if (latestDetections.length < 3) return null;

    try {
      return estimateDronePositionFromDetections(latestDetections, {
        soundSpeed: SOUND_SPEED,
        minConfidence: 70,
      });
    } catch (err) {
      console.error("Erro ao estimar posição do drone:", err);
      return null;
    }
  }, [detections]);

  const sensorsFromDetections = useMemo<Sensor[]>(() => {
    if (detections.length === 0) {
      return data.sensors;
    }

    const latestByDevice = new Map<string, DetectionMessage>();

    for (const det of detections) {
      latestByDevice.set(det.device_id, det);
    }

    return Array.from(latestByDevice.values()).map((det) => ({
      id: det.device_id,
      status: "online",
      position: [det.latitude, det.longitude],
    }));
  }, [detections, data.sensors]);

  const displayedDronePosition: [number, number] = estimatedDrone
    ? [estimatedDrone.latitude, estimatedDrone.longitude]
    : data.dronePosition;

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const simulation = setInterval(() => {
      const analysisId = Math.floor(Date.now() / 5000);

      const baseDrone = point300mWestOf(data.myPosition);

      const droneJitterNorth = (Math.random() - 0.5) * 20;
      const droneJitterEast = (Math.random() - 0.5) * 20;

      const [dLat, dLng] = metersToLatLngOffset(
        droneJitterNorth,
        droneJitterEast,
        data.myPosition[0]
      );

      const trueDrone: [number, number] = [
        baseDrone[0] + dLat,
        baseDrone[1] + dLng,
      ];

      const refLat = data.myPosition[0];
      const refLng = data.myPosition[1];
      const emissionTime = Date.now() / 1000;

      const mockDevices: DetectionMessage[] = data.sensors.map((sensor) => {
        const dMeters = distanceMeters(sensor.position, trueDrone, refLat, refLng);
        const travelTime = dMeters / SOUND_SPEED;
        const noiseSeconds = (Math.random() - 0.5) * 0.00005;

        return {
          device_id: sensor.id,
          threat_type: "UAV/Drone",
          confidence: 95 + Math.random() * 4,
          latitude: sensor.position[0],
          longitude: sensor.position[1],
          timestamp: emissionTime + travelTime + noiseSeconds,
          analysis_id: analysisId,
        };
      });

      mockDevices.forEach(addDetection);

      const newConfidence = 0.94 + Math.random() * 0.05;

      setData((prev) => ({
        ...prev,
        alert: true,
        drone: true,
        confidence: newConfidence,
        direction: (prev.direction + 4) % 360,
        dronePosition: trueDrone,
      }));

      setEventCounter((prevId) => {
        setHistory((prevHistory) => {
          const entry: DroneEvent = {
            id: prevId,
            timestamp: new Date(),
            position: trueDrone,
            confidence: newConfidence,
          };

          return [entry, ...prevHistory].slice(0, 20);
        });

        return prevId + 1;
      });
    }, 5000);

    return () => clearInterval(simulation);
  }, [addDetection, data.sensors, data.myPosition]);

  const onlineSensors = sensorsFromDetections.filter(
    (sensor) => sensor.status === "online"
  ).length;

  return (
    <div className="es-root">
      <div className="es-scanline" />

      <header className="es-header">
        <div className="es-logo">
          <span className="es-logo-main">ECHOSHIELD</span>
          <span className="es-logo-sub">ACOUSTIC THREAT DETECTION SYSTEM</span>
        </div>

        <div className="es-header-right">
          <div className={`es-pill ${data.alert ? "es-pill--alert" : "es-pill--ok"}`}>
            {data.alert ? "THREAT ACTIVE" : "CLEAR"}
          </div>

          <div className="es-timestamp">
            {time.toISOString().replace("T", " ").substring(0, 19)} UTC
          </div>
        </div>
      </header>

      <Alerts
        alert={data.alert}
        confidence={estimatedDrone ? Math.min(data.confidence + 0.02, 0.99) : data.confidence}
      />

      <div className="es-grid">
        <aside className="es-left">
          <div className="es-panel">
            <div className="es-panel-label">Sensor Network</div>
            <SensorStatus sensors={sensorsFromDetections} />
          </div>

          <div className="es-panel es-panel--grow">
            <div className="es-panel-label">Detection History</div>
            <DroneHistory events={history} />
          </div>
        </aside>

        <main className="es-right">
          <div className="es-metrics">
            <div className="es-metric">
              <div className="es-metric-label">Direction</div>
              <div className="es-metric-value es-metric-value--danger">
                {data.direction}°
              </div>
              <div className="es-metric-unit">azimuth</div>
            </div>

            <div className="es-metric">
              <div className="es-metric-label">Confidence</div>
              <div className="es-metric-value es-metric-value--warn">
                {data.confidence.toFixed(2)}
              </div>
              <div className="es-metric-unit">ai score</div>
            </div>

            <div className="es-metric">
              <div className="es-metric-label">Sensors</div>
              <div className="es-metric-value">
                {onlineSensors}/{sensorsFromDetections.length}
              </div>
              <div className="es-metric-unit">online</div>
            </div>

            <div className="es-metric">
              <div className="es-metric-label">Events</div>
              <div className="es-metric-value es-metric-value--danger">
                {history.length}
              </div>
              <div className="es-metric-unit">logged</div>
            </div>

            <div className="es-metric">
              <div className="es-metric-label">TDOA Error</div>
              <div className="es-metric-value es-metric-value--warn">
                {estimatedDrone ? estimatedDrone.error.toFixed(3) : "--"}
              </div>
              <div className="es-metric-unit">fit</div>
            </div>

            <div className="es-metric">
              <div className="es-metric-label">Detections</div>
              <div className="es-metric-value">
                {estimatedDrone ? estimatedDrone.usedDetections : 0}
              </div>
              <div className="es-metric-unit">used</div>
            </div>
          </div>

          <div className="es-panel es-panel--grow">
            <div className="es-panel-label">Threat Map — Lisbon AO</div>
            <MapView
              myPosition={data.myPosition}
              sensors={sensorsFromDetections}
              drone={{ position: displayedDronePosition }}
              confidence={data.confidence}
              history={history}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;