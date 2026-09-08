import firsRaw from "./raw/firs.json";
import membersRaw from "./raw/network_members.json";
import burnerRaw from "./raw/burner.json";
import discoveriesRaw from "./raw/discoveries.json";
import cdrRaw from "./raw/cdr.json";
import finRaw from "./raw/financial.json";
import subsRaw from "./raw/subscriber_master.json";
import towersRaw from "./raw/tower_master.json";
import dumpRaw from "./raw/tower_dump.json";

import type {
  BurnerDevice,
  CDRRecord,
  Discoveries,
  FIRRecord,
  FinancialRecord,
  NetworkMember,
  SubscriberRecord,
  TowerDumpRecord,
  TowerRecord,
} from "./types";

export const firs = firsRaw as FIRRecord[];
export const networkMembers = membersRaw as NetworkMember[];
export const burner = burnerRaw as BurnerDevice;
export const discoveries = discoveriesRaw as Discoveries;
export const cdr = cdrRaw as CDRRecord[];
export const financial = finRaw as FinancialRecord[];
export const subscribers = subsRaw as SubscriberRecord[];
export const towers = towersRaw as TowerRecord[];
export const towerDump = dumpRaw as TowerDumpRecord[];

export function memberByPhone(phone: string): NetworkMember | undefined {
  return networkMembers.find(
    (m) => m.phone === phone || m.phone2 === phone,
  );
}

export function memberByKey(key: string): NetworkMember | undefined {
  return networkMembers.find((m) => m.key === key);
}

export function firByNumber(firNo: string): FIRRecord | undefined {
  return firs.find((f) => f.fir_no === firNo);
}

export function firByIdx(idx: number): FIRRecord | undefined {
  return firs.find((f) => f.idx === idx);
}

export function subscriberByPhone(phone: string): SubscriberRecord | undefined {
  return subscribers.find((s) => s.phone === phone);
}

export function towerById(cell: string): TowerRecord | undefined {
  return towers.find((t) => t.cell_id === cell);
}