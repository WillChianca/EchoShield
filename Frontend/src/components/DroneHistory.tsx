import type { DroneEvent } from "../App";
import "./DroneHistory.css";

type Props = {
  events: DroneEvent[];
};

function formatTime(d: Date): string {
  return d.toISOString().replace("T", " ").substring(11, 19) + " UTC";
}

function formatCoords([lat, lng]: [number, number]): string {
  return `${lat.toFixed(4)}°N  ${Math.abs(lng).toFixed(4)}°W`;
}

function timeAgo(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

const DroneHistory = ({ events }: Props) => {
  if (events.length === 0) {
    return (
      <div className="dh-empty">
        <span>NO EVENTS LOGGED</span>
      </div>
    );
  }

  return (
    <div className="dh-list">
      {events.map((evt, i) => (
        <div key={evt.id} className={`dh-row ${i === 0 ? "dh-row--latest" : ""}`}>
          <div className="dh-row-top">
            <span className="dh-index">#{String(events.length - i).padStart(3, "0")}</span>
            <span className="dh-time">{formatTime(evt.timestamp)}</span>
            <span className="dh-ago">{timeAgo(evt.timestamp)}</span>
          </div>
          <div className="dh-row-bot">
            <span className="dh-coords">{formatCoords(evt.position)}</span>
            <span className={`dh-conf ${evt.confidence > 0.9 ? "dh-conf--high" : ""}`}>
              {Math.round(evt.confidence * 100)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DroneHistory;
