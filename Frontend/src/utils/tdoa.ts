export type DetectionMessage = {
  device_id: string;
  threat_type: string;
  confidence: number;
  latitude: number;
  longitude: number;
  timestamp: number; // idealmente com frações: ex. 1774614195.123456
  analysis_id: number;
};

type LocalPoint = {
  x: number;
  y: number;
};

type LocalDetection = DetectionMessage & LocalPoint;

type EstimatedPosition = {
  latitude: number;
  longitude: number;
  x: number;
  y: number;
  error: number;
  usedDetections: number;
};

const DEFAULT_SOUND_SPEED = 343; // m/s

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function distance2D(a: LocalPoint, b: LocalPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Converte lat/lng em coordenadas locais em metros
 * usando uma aproximação suficiente para áreas pequenas.
 */
function latLngToLocalMeters(
  latitude: number,
  longitude: number,
  refLat: number,
  refLng: number
): LocalPoint {
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(toRadians(refLat));

  return {
    x: (longitude - refLng) * metersPerDegLng,
    y: (latitude - refLat) * metersPerDegLat,
  };
}

/**
 * Converte coordenadas locais em metros de volta para lat/lng.
 */
function localMetersToLatLng(
  x: number,
  y: number,
  refLat: number,
  refLng: number
): { latitude: number; longitude: number } {
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(toRadians(refLat));

  return {
    latitude: refLat + y / metersPerDegLat,
    longitude: refLng + x / metersPerDegLng,
  };
}

/**
 * Escolhe um ponto de referência geográfico para conversão local.
 */
function getReferenceLatLng(detections: DetectionMessage[]): {
  refLat: number;
  refLng: number;
} {
  const refLat =
    detections.reduce((sum, d) => sum + d.latitude, 0) / detections.length;
  const refLng =
    detections.reduce((sum, d) => sum + d.longitude, 0) / detections.length;

  return { refLat, refLng };
}

/**
 * Filtra deteções utilizáveis.
 */
function filterValidDetections(
  detections: DetectionMessage[],
  minConfidence = 0
): DetectionMessage[] {
  return detections.filter(
    (d) =>
      Number.isFinite(d.latitude) &&
      Number.isFinite(d.longitude) &&
      Number.isFinite(d.timestamp) &&
      Number.isFinite(d.confidence) &&
      d.confidence >= minConfidence
  );
}

/**
 * Converte deteções para coordenadas locais.
 */
function toLocalDetections(
  detections: DetectionMessage[],
  refLat: number,
  refLng: number
): LocalDetection[] {
  return detections.map((d) => {
    const local = latLngToLocalMeters(d.latitude, d.longitude, refLat, refLng);
    return { ...d, ...local };
  });
}

/**
 * Calcula o erro total de uma posição candidata com base em TDOA.
 * Usa como referência o sensor que ouviu primeiro.
 */
function computeTdoaError(
  candidate: LocalPoint,
  detections: LocalDetection[],
  soundSpeed: number
): number {
  const ref = detections.reduce((earliest, current) =>
    current.timestamp < earliest.timestamp ? current : earliest
  );

  const dRef = distance2D(candidate, ref);

  let weightedError = 0;
  let weightSum = 0;

  for (const det of detections) {
    if (det.device_id === ref.device_id) continue;

    const d = distance2D(candidate, det);
    const predictedDeltaDistance = d - dRef;
    const measuredDeltaDistance = soundSpeed * (det.timestamp - ref.timestamp);

    const residual = predictedDeltaDistance - measuredDeltaDistance;

    // peso opcional pela confiança
    const weight = Math.max(0.1, det.confidence / 100);

    weightedError += weight * residual * residual;
    weightSum += weight;
  }

  if (weightSum === 0) return Number.POSITIVE_INFINITY;
  return weightedError / weightSum;
}

/**
 * Faz uma pesquisa em grelha para encontrar a posição inicial.
 */
function coarseGridSearch(
  detections: LocalDetection[],
  soundSpeed: number,
  paddingMeters = 300,
  stepMeters = 10
): { point: LocalPoint; error: number } {
  const xs = detections.map((d) => d.x);
  const ys = detections.map((d) => d.y);

  const minX = Math.min(...xs) - paddingMeters;
  const maxX = Math.max(...xs) + paddingMeters;
  const minY = Math.min(...ys) - paddingMeters;
  const maxY = Math.max(...ys) + paddingMeters;

  let bestPoint: LocalPoint = { x: 0, y: 0 };
  let bestError = Number.POSITIVE_INFINITY;

  for (let x = minX; x <= maxX; x += stepMeters) {
    for (let y = minY; y <= maxY; y += stepMeters) {
      const point = { x, y };
      const error = computeTdoaError(point, detections, soundSpeed);

      if (error < bestError) {
        bestError = error;
        bestPoint = point;
      }
    }
  }

  return { point: bestPoint, error: bestError };
}

/**
 * Refina a posição com pesquisa local progressiva.
 */
function refineSearch(
  start: LocalPoint,
  detections: LocalDetection[],
  soundSpeed: number
): { point: LocalPoint; error: number } {
  let current = { ...start };
  let currentError = computeTdoaError(current, detections, soundSpeed);

  const steps = [5, 2, 1, 0.5];

  for (const step of steps) {
    let improved = true;

    while (improved) {
      improved = false;

      const candidates: LocalPoint[] = [
        { x: current.x + step, y: current.y },
        { x: current.x - step, y: current.y },
        { x: current.x, y: current.y + step },
        { x: current.x, y: current.y - step },
        { x: current.x + step, y: current.y + step },
        { x: current.x + step, y: current.y - step },
        { x: current.x - step, y: current.y + step },
        { x: current.x - step, y: current.y - step },
      ];

      for (const candidate of candidates) {
        const error = computeTdoaError(candidate, detections, soundSpeed);
        if (error < currentError) {
          current = candidate;
          currentError = error;
          improved = true;
        }
      }
    }
  }

  return { point: current, error: currentError };
}

/**
 * Estima a posição do drone para um grupo de deteções do mesmo evento.
 */
export function estimateDronePositionFromDetections(
  detections: DetectionMessage[],
  options?: {
    soundSpeed?: number;
    minConfidence?: number;
  }
): EstimatedPosition | null {
  const soundSpeed = options?.soundSpeed ?? DEFAULT_SOUND_SPEED;
  const minConfidence = options?.minConfidence ?? 0;

  const valid = filterValidDetections(detections, minConfidence);

  if (valid.length < 3) {
    return null;
  }

  // Idealmente todas pertencem ao mesmo analysis_id
  const analysisIds = new Set(valid.map((d) => d.analysis_id));
  if (analysisIds.size > 1) {
    throw new Error("As deteções devem pertencer ao mesmo analysis_id.");
  }

  const { refLat, refLng } = getReferenceLatLng(valid);
  const localDetections = toLocalDetections(valid, refLat, refLng);

  const coarse = coarseGridSearch(localDetections, soundSpeed, 400, 10);
  const refined = refineSearch(coarse.point, localDetections, soundSpeed);

  const geo = localMetersToLatLng(refined.point.x, refined.point.y, refLat, refLng);

  return {
    latitude: geo.latitude,
    longitude: geo.longitude,
    x: refined.point.x,
    y: refined.point.y,
    error: refined.error,
    usedDetections: valid.length,
  };
}

/**
 * Agrupa mensagens por analysis_id.
 */
export function groupDetectionsByAnalysisId(
  detections: DetectionMessage[]
): Map<number, DetectionMessage[]> {
  const groups = new Map<number, DetectionMessage[]>();

  for (const detection of detections) {
    const group = groups.get(detection.analysis_id) ?? [];
    group.push(detection);
    groups.set(detection.analysis_id, group);
  }

  return groups;
}