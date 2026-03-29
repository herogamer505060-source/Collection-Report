export interface InstallmentData {
  customer: string;
  project: string;
  unitCode: string;
  type: string;
  installmentCode: string;
  date: string;
  value: number;
  netValue: number;
  collected: number;
  remaining: number;
  commercialPaper: string;
  notes: string;
}

export interface DashboardStats {
  totalNetValue: number;
  totalCollected: number;
  totalRemaining: number;
  collectionRate: number;
  projectStats: { name: string; collected: number; remaining: number }[];
  monthlyStats: { month: string; collected: number; remaining: number }[];
}
