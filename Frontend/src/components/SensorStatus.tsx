import "./SensorStatus.css";

type Sensor = {
  id: string;
  status: "online" | "offline";
};

type Props = {
  sensors: Sensor[];
};

const SensorStatus = ({ sensors }: Props) => {
  const online = sensors.filter((s) => s.status === "online").length;

  return (
    <div className="sensor-list">
      <div className="sensor-summary">
        <span className="sensor-summary-count">{online}/{sensors.length}</span>
        <span className="sensor-summary-label">SENSORS ONLINE</span>
      </div>

      {sensors.map((s) => (
        <div key={s.id} className="sensor-row">
          <span className="sensor-id">{s.id}</span>
          <div className="sensor-right">
            <div className={`sensor-dot sensor-dot--${s.status}`} />
            <span className={`sensor-status sensor-status--${s.status}`}>
              {s.status.toUpperCase()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SensorStatus;
