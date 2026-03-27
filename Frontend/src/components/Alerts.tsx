import "./Alerts.css";

type Props = {
  alert: boolean;
  confidence: number;
};

const Alerts = ({ alert, confidence }: Props) => {
  if (!alert) return null;

  return (
    <div className="alert-bar">
      <div className="alert-dot" />
      <span className="alert-text">
        DRONE DETECTED — THREAT LOCK CONFIRMED
      </span>
      <span className="alert-conf">
        CONF: {Math.round(confidence * 100)}%
      </span>
    </div>
  );
};

export default Alerts;
