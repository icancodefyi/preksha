export type Cluster =
  | "core"
  | "drugs"
  | "finance"
  | "execution"
  | "gambling"
  | "trafficking"
  | "arms"
  | "counterfeit"
  | "extortion"
  | "unknown";

export interface NetworkMember {
  key: string;
  name: string;
  alias: string;
  role: string;
  phone: string;
  phone2: string | null;
  cluster: Cluster;
  city: string;
  imei: string;
  addr: string;
  accounts: { bank: string; acct: string }[];
}

export interface BurnerDevice {
  key: string;
  name: string;
  alias: string;
  role: string;
  phone: string;
  phone2: string | null;
  cluster: Cluster;
  city: string;
  imei: string;
  addr: string;
  accounts: [];
}

export interface FIRRecord {
  idx: number;
  fir_no: string;
  year: number;
  police_station: string;
  district: string;
  state: string;
  incident_date: string;
  incident_time: string;
  registered_date: string;
  title: string;
  category: string;
  sections: string[];
  complainant: { name: string; phone: string | null; address: string; relation: string };
  accused: { name: string | null; alias: string; description: string; status: string }[];
  narrative: string;
  entities: { persons: string[]; phones: string[]; accounts: string[]; places: string[] };
  evidence: Record<string, string[] | undefined>;
  related_firs: number[];
}

export interface CDRRecord {
  call_id: string;
  caller: string;
  receiver: string;
  timestamp: string;
  duration_sec: number;
  call_type: string;
  caller_cell: string;
  receiver_cell: string;
  imei_caller: string;
}

export interface FinancialRecord {
  txn_id: string;
  date: string;
  time: string;
  from_account: string;
  from_name: string;
  to_account: string;
  to_name: string;
  amount: number;
  method: string;
  bank: string;
  branch: string;
  remark: string;
}

export interface SubscriberRecord {
  phone: string;
  name: string;
  dob: string;
  gender: string;
  address: string;
  city: string;
  operator: string;
  activation: string;
}

export interface TowerRecord {
  cell_id: string;
  tower: string;
  landmark: string;
  lat: number;
  lng: number;
  city: string;
  district: string;
  micro_market: string;
}

export interface TowerDumpRecord {
  dump_id: string;
  phone: string;
  imei: string;
  timestamp: string;
  cell_id: string;
  event: string;
}

export interface Discoveries {
  [key: string]: {
    [k: string]: string | string[];
  };
}