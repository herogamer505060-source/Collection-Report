export interface InstallmentData {
  id?: string; // Firestore document ID
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
  uid?: string; // Owner UID
  createdAt?: string; // ISO 8601 creation timestamp
}

export interface DashboardStats {
  totalNetValue: number;
  totalCollected: number;
  totalRemaining: number;
  collectionRate: number;
  projectStats: { name: string; collected: number; remaining: number; total: number }[];
  monthlyStats: { month: string; collected: number; remaining: number }[];
}
