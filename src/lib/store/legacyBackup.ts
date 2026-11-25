/**
 * Exports of the old EV-Charter app, converted to ChargeLog backup data. The
 * result is checked like any ChargeLog backup afterwards.
 */
import type { Backup } from './backup';
import type { Settings } from './store';
import { DEFAULT_SETTINGS, isRecord } from './rules';

/**
 * An EV-Charter export: `{ version, exportDate, vehicles[], sessions[], settings }`;
 * `version` is not needed.
 */
interface LegacyExport {
  exportDate: unknown;
  vehicles: unknown[];
  sessions: unknown[];
  settings?: unknown;
}

/** True for the JSON of an EV-Charter export. */
export function isLegacyExport(data: unknown): data is LegacyExport {
  return (
    isRecord(data) &&
    !('format' in data) &&
    'exportDate' in data &&
    Array.isArray(data.vehicles) &&
    Array.isArray(data.sessions)
  );
}

/**
 * The export as ChargeLog backup data, still to be checked. Vehicles get the
 * ids 1, 2, … in export order and sessions keep pointing at theirs. Every
 * session gets the export's price and charging loss; its energy and cost stay
 * as exported.
 */
export function fromLegacyExport(
  data: LegacyExport,
): Record<Exclude<keyof Backup, 'format' | 'schemaVersion'>, unknown> {
  const settings = legacySettings(data.settings);
  const legacyVehicles = data.vehicles.map((item) => (isRecord(item) ? item : {}));
  // The old app allowed vehicles without a default; ChargeLog needs exactly one.
  const defaultIndex = Math.max(
    legacyVehicles.findIndex((v) => v.isDefault === true),
    0,
  );
  const newVehicleIds = new Map<unknown, number>();
  const vehicles = legacyVehicles.map((v, index) => {
    newVehicleIds.set(v.id, index + 1);
    return {
      id: index + 1,
      name: v.name,
      batteryCapacityKwh: v.batterySize,
      isDefault: index === defaultIndex,
    };
  });
  const sessions = data.sessions.map((item, index) => {
    const s = isRecord(item) ? item : {};
    return {
      id: index + 1,
      vehicleId: newVehicleIds.get(s.vehicleId),
      date: s.date,
      startPercent: s.startPercentage,
      endPercent: s.endPercentage,
      pricePerKwh: settings.defaultPricePerKwh,
      chargingLossPercent: settings.defaultChargingLossPercent,
      gridEnergyKwh: s.energy,
      costEur: s.cost,
    };
  });
  return { exportedAt: data.exportDate, settings, vehicles, sessions };
}

/**
 * The export's electricity price and charging loss as the new defaults; the
 * old app's language and dark mode are left out.
 */
function legacySettings(data: unknown): Settings {
  // A list of `{ name, value }` rows; older exports hold an object map instead.
  const values = new Map<unknown, unknown>(
    Array.isArray(data)
      ? data.filter(isRecord).map((row) => [row.name, row.value])
      : isRecord(data)
        ? Object.entries(data)
        : [],
  );
  // Unchecked here: the backup check rejects a price or loss that is not a valid number.
  return {
    ...DEFAULT_SETTINGS,
    defaultPricePerKwh: (values.get('electricityPrice') ??
      DEFAULT_SETTINGS.defaultPricePerKwh) as number,
    defaultChargingLossPercent: (values.get('chargingLoss') ??
      DEFAULT_SETTINGS.defaultChargingLossPercent) as number,
  };
}
