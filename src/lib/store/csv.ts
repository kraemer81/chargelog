import { formatEditableDecimal } from '../format';
import { batteryEnergyKwh, type ChargingSession, type Vehicle } from './store';

/** Makes Excel read the file as UTF-8, so umlauts survive. */
const BYTE_ORDER_MARK = '\uFEFF';

const COLUMNS: { header: string; value: (session: ChargingSession, vehicle: Vehicle) => string }[] = [
  { header: 'Datum', value: (s) => germanDate(s.date) },
  { header: 'Fahrzeug', value: (_, v) => v.name },
  { header: 'Akkukapazität (kWh)', value: (_, v) => decimal(v.batteryCapacityKwh) },
  { header: 'Start (%)', value: (s) => decimal(s.startPercent) },
  { header: 'Ende (%)', value: (s) => decimal(s.endPercent) },
  { header: 'Geladen (%)', value: (s) => decimal(s.endPercent - s.startPercent) },
  { header: 'Aus dem Netz (kWh)', value: (s) => decimal(s.gridEnergyKwh) },
  { header: 'In den Akku (kWh)', value: (s) => decimal(batteryEnergyKwh(s)) },
  { header: 'Preis (€/kWh)', value: (s) => decimal(s.pricePerKwh) },
  { header: 'Ladeverlust (%)', value: (s) => decimal(s.chargingLossPercent) },
  { header: 'Kosten (€)', value: (s) => decimal(s.costEur) },
  { header: 'Notiz', value: (s) => s.note ?? '' },
];

/**
 * The sessions, in the given order, as a CSV file a German Excel opens by
 * double-click: semicolon-separated, decimal comma, dates as `DD.MM.YYYY`,
 * UTF-8 with byte order mark, CRLF line ends. The battery capacity is the
 * vehicle's current one.
 */
export function sessionsCsv(sessions: ChargingSession[], vehicles: Vehicle[]): string {
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));
  const rows = [
    COLUMNS.map((column) => column.header),
    ...sessions.map((session) => {
      // Sessions never outlive their vehicle: deleting one deletes its sessions,
      // and backups are checked for it.
      const vehicle = vehiclesById.get(session.vehicleId)!;
      return COLUMNS.map((column) => column.value(session, vehicle));
    }),
  ];
  return BYTE_ORDER_MARK + rows.map((row) => `${row.map(csvField).join(';')}\r\n`).join('');
}

/** "38,28" — every decimal, no grouping, so Excel reads it as a number. */
function decimal(value: number): string {
  return formatEditableDecimal(value);
}

/** "01.11.2026" for `2026-11-01`. */
function germanDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

/** Quotes a value containing a separator, quote or line break, doubling its quotes. */
function csvField(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
