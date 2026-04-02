export interface Operation {
  id: string; // N da Operação
  date: string;
  time: string;
  uope: string;
  location: string;
  circumstance: string;
  initialCommunication: string;
  finalReport: string;
  status: string;
}

export interface DashboardStats {
  total: number;
  duplicates: number;
  byUope: { name: string; value: number }[];
  byStatus: { name: string; value: number }[];
  duplicateIds: string[];
  mostDuplicatedUope?: { name: string; count: number };
  topDuplicatedUopes: { name: string; count: number }[];
}
