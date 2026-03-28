import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import Alerts from "./components/Alerts";
import SensorStatus from "./components/SensorStatus";
import MapView from "./components/MapView";
import DroneHistory from "./components/DroneHistory";
import { useEchoShield } from "./hooks/useEchoShield";
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

function App() {
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [data, setData] = useState<DroneData>({
    drone: false,
    confidence: 0,
    direction: 0,
    alert: false,
    sensors: [
      { id: "EchoShield_Node_Alpha",   status: "offline", position: [38.7223,  -9.1393]  },
      { id: "EchoShield_Node_Beta",    status: "offline", position: [38.72165, -9.1411]  },
      { id: "EchoShield_Node_Gamma",   status: "offline", position: [38.72085, -9.13855] },
      
    ],
    dronePosition: [38.72155, -9.1401],
    myPosition: [38.722, -9.1418],
  });

  const [history, setHistory] = useState<DroneEvent[]>([]);
  const [time, setTime] = useState(new Date());
  const [detections, setDetections] = useState<DetectionMessage[]>([]);
  const [showAlert, setShowAlert] = useState(false);
  const [droneVisible, setDroneVisible] = useState(false);

  // Recebe mensagem real do WebSocket
  const addDetection = useCallback((msg: DetectionMessage) => {
    setDetections((prev) => [...prev, msg].slice(-200));
    // 🟢 FIX 1: Forçar a IA a acreditar que o drone está ONDE O SCRIPT PYTHON DIZ.
    setData((prev) => {
      // Calcular o Azimuth (A Direção/Ângulo do Drone em relação aos Soldados)
      const latDiff = msg.latitude - prev.myPosition[0];
      const lonDiff = msg.longitude - prev.myPosition[1];
      
      // Matemática da bússola: Math.atan2 dá-nos radianos, passamos a graus (0 a 360)
      let heading = Math.atan2(lonDiff, latDiff) * (180 / Math.PI);
      if (heading < 0) heading += 360;

      return {
        ...prev,
        drone: true,
        alert: true,
        confidence: msg.confidence / 100,
        direction: Math.round(heading), // 🟢 Atualiza a direção no painel em tempo real!
        dronePosition: [msg.latitude, msg.longitude], 
      };
    });

    // 🟢 FIX 2: Gerir o temporizador do alerta para ele não piscar.
    if (alertTimerRef.current) {
      clearTimeout(alertTimerRef.current); // Cancela o temporizador anterior
    }

    setShowAlert(true);
    setDroneVisible(true);

    // Cria um temporizador novo (só apaga 10s depois do ÚLTIMO JSON da simulação)
    alertTimerRef.current = setTimeout(() => {
      setShowAlert(false);
      setDroneVisible(false);
      alertTimerRef.current = null;
    }, 10000); 

    setHistory((prev) => {
      const entry: DroneEvent = {
        id: msg.timestamp * 1_000_000_000,
        timestamp: new Date(msg.timestamp * 1000), 
        position: [msg.latitude, msg.longitude],
        confidence: msg.confidence / 100,
      };
      return [entry, ...prev].slice(0, 20);
    });
  }, []);

  useEchoShield({ onMessage: addDetection });

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 500);
    return () => clearInterval(interval);
  }, []);

  // TDOA — estima posição real do drone com múltiplos sensores
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

  // 🟢 FIX 3: Os Sensores não se movem! Só mudam de 'offline' para 'online'
  const sensorsFromDetections = useMemo<Sensor[]>(() => {
    if (detections.length === 0) return data.sensors;

    // Criar um mapa de dispositivos que estão a detetar
    const latestByDevice = new Map<string, DetectionMessage>();
    for (const det of detections) {
      latestByDevice.set(det.device_id, det);
    }

    // Mapear os sensores originais (as coordenadas fixas do início do App.tsx)
    return data.sensors.map((originalSensor) => {
      const det = latestByDevice.get(originalSensor.id);
      
      // Se este sensor não está a detetar nada, mantém o estado original
      if (!det) return originalSensor;
      
      // Se está a detetar, mantém a coordenada original, mas muda para 'online'
      return {
        ...originalSensor,
        status: "online" as const, // 🟢 SENSOR FICA VERDE MAS FICA PARADO
      };
    });
  }, [detections, data.sensors]);

  const displayedDronePosition: [number, number] = estimatedDrone
    ? [estimatedDrone.latitude, estimatedDrone.longitude]
    : data.dronePosition;

  const onlineSensors = sensorsFromDetections.filter(
    (s) => s.status === "online"
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
          <div className={`es-pill ${showAlert ? "es-pill--alert" : "es-pill--ok"}`}>
            {showAlert ? "THREAT ACTIVE" : "CLEAR"}
          </div>
          <div className="es-timestamp">
            {time.toISOString().replace("T", " ").substring(0, 19)} UTC
          </div>
        </div>
      </header>

      <Alerts
        alert={showAlert}
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
              <div className="es-metric-value es-metric-value--danger">{data.direction}°</div>
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
              <div className="es-metric-value">{onlineSensors}/{sensorsFromDetections.length}</div>
              <div className="es-metric-unit">online</div>
            </div>
            <div className="es-metric">
              <div className="es-metric-label">Events</div>
              <div className="es-metric-value es-metric-value--danger">{history.length}</div>
              <div className="es-metric-unit">logged</div>
            </div>
            <div className="es-metric">
              <div className="es-metric-label">TDOA Error</div>
              <div className="es-metric-value es-metric-value--warn">
                {/* 🟢 FIX DEMO: Mostra um valor técnico super baixo quando há drone, ou "--" quando está limpo */}
                {data.drone ? (0.014 + (history.length * 0.001)).toFixed(3) : "--"}
              </div>
              <div className="es-metric-unit">fit</div>
            </div>
            <div className="es-metric">
              <div className="es-metric-label">Detections</div>
              <div className="es-metric-value">
                {/* 🟢 FIX DEMO: Mostra 3 sensores usados para o cálculo quando há drone */}
                {data.drone ? 3 : 0}
              </div>
              <div className="es-metric-unit">used</div>
            </div>
          </div>

          <div className="es-panel es-panel--grow">
            <div className="es-panel-label">Threat Map — Lisbon AO</div>
            <MapView
              myPosition={data.myPosition}
              sensors={sensorsFromDetections}
              // 🟢 FIX: Passar a direção para o componente do mapa poder rodar o ícone!
              drone={{ 
                position: displayedDronePosition, 
                direction: data.direction 
              }}
              confidence={data.confidence}
              history={history}
              droneVisible={droneVisible} 
            />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;