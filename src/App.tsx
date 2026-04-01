/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  Component,
  ErrorInfo,
  ReactNode,
} from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  LabelList,
  ComposedChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Upload,
  TrendingUp,
  DollarSign,
  Users,
  AlertCircle,
  Download,
  Printer,
  Search,
  CheckCircle2,
  Loader2,
  Calendar,
  X,
  FileSpreadsheet,
  PieChart as PieChartIcon,
  LogIn,
  LogOut,
  User as UserIcon,
  MessageCircle,
} from "lucide-react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";
import { InstallmentData, DashboardStats } from "./types";
import { analyzeCollectionPDF, isAIConfigured } from "./services/geminiService";
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  handleFirestoreError,
  OperationType,
} from "./firebase";
import { User } from "firebase/auth";

// Error Boundary Component
class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message || String(error) };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if ((this.state as any).hasError) {
      let displayError = "حدث خطأ غير متوقع.";
      try {
        const parsed = JSON.parse((this.state as any).errorInfo || "{}");
        if (parsed.error) {
          displayError = `خطأ في قاعدة البيانات: ${parsed.error}`;
        }
      } catch (e) {
        displayError = (this.state as any).errorInfo || displayError;
      }

      return (
        <div
          className="min-h-screen flex items-center justify-center bg-slate-50 p-4 dir-rtl"
          dir="rtl"
        >
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-rose-100 max-w-md w-full text-center">
            <AlertCircle className="mx-auto text-rose-500 mb-4" size={48} />
            <h2 className="text-2xl font-bold text-slate-800 mb-4">
              عذراً، حدث خطأ ما
            </h2>
            <p className="text-slate-600 mb-6">{displayError}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }

    return (this.props as any).children;
  }
}

// Sample data for initial view - Matching PDF exactly
const SAMPLE_DATA: InstallmentData[] = [
  {
    customer: "محمد عيد ابو زيد محارب",
    project: "IL Parco",
    unitCode: "IL Parco-G2",
    type: "الدفعة المقدمة",
    installmentCode: "2024020113",
    date: "2025-02-17",
    value: 1300000,
    netValue: 1300000,
    collected: 1299600,
    remaining: 400,
    commercialPaper: "",
    notes: "",
  },
  {
    customer: "ربيع عبد الرحمن عبد العال محمد",
    project: "IL Parco",
    unitCode: "IL Parco-G-11",
    type: "قسط",
    installmentCode: "2025032402",
    date: "2025-06-24",
    value: 245193,
    netValue: 245193,
    collected: 245000,
    remaining: 193,
    commercialPaper: "",
    notes: "",
  },
  {
    customer: "احمد محمد خليفة محمد",
    project: "IL Centro",
    unitCode: "IL Centro-F22",
    type: "قسط",
    installmentCode: "2025093003",
    date: "2025-07-01",
    value: 264927,
    netValue: 264927,
    collected: 209003,
    remaining: 55924,
    commercialPaper: "",
    notes: "",
  },
  {
    customer: "محمد عبدالجيد غمرى شعراوى",
    project: "Caza",
    unitCode: "Caza-G28",
    type: "قسط",
    installmentCode: "2025121302",
    date: "2026-03-15",
    value: 156070,
    netValue: 156070,
    collected: 156070,
    remaining: 156070,
    commercialPaper: "60317000023576",
    notes: "",
  },
];

const ADMIN_EMAIL = "hero.gamer505060@gmail.com";

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(val);
};

const formatDate = (dateStr: string) => {
  if (!dateStr || dateStr.trim() === "" || dateStr === "0") return "-";
  try {
    // If it's already in a standard YYYY-MM-DD format, try to format it for display
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch (e) {
    return dateStr;
  }
};

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [data, setData] = useState<InstallmentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAiError, setShowAiError] = useState(!isAIConfigured());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProject, setFilterProject] = useState("الكل");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "reports">(
    "dashboard",
  );
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const isAdmin = useMemo(() => user?.email === ADMIN_EMAIL, [user]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (!currentUser) {
        setIsLoading(false);
        setData(SAMPLE_DATA);
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync
  useEffect(() => {
    if (!isAuthReady || !user) return;

    setIsLoading(true);
    const q = query(
      collection(db, "installments"),
      where("uid", "==", user.uid),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const installments: InstallmentData[] = [];
        snapshot.forEach((doc) => {
          installments.push({ id: doc.id, ...doc.data() } as InstallmentData);
        });

        // Sort by date or createdAt if needed
        setData(installments.length > 0 ? installments : SAMPLE_DATA);
        setIsLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "installments");
      },
    );

    return () => unsubscribe();
  }, [isAuthReady, user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setData(SAMPLE_DATA);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleUpdateNote = async (
    customer: string,
    installmentCode: string,
    newNote: string,
  ) => {
    // Optimistic update
    setData((prev) =>
      prev.map((item) =>
        item.customer === customer && item.installmentCode === installmentCode
          ? { ...item, notes: newNote }
          : item,
      ),
    );

    if (user) {
      const item = data.find(
        (i) => i.customer === customer && i.installmentCode === installmentCode,
      );
      if (item && item.id) {
        try {
          await setDoc(
            doc(db, "installments", item.id),
            { ...item, notes: newNote },
            { merge: true },
          );
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.UPDATE,
            `installments/${item.id}`,
          );
        }
      }
    }
  };

  const handleUpdatePhone = async (
    customer: string,
    installmentCode: string,
    newPhone: string,
  ) => {
    setData((prev) =>
      prev.map((item) =>
        item.customer === customer && item.installmentCode === installmentCode
          ? { ...item, phone: newPhone }
          : item,
      ),
    );

    if (user) {
      const item = data.find(
        (i) => i.customer === customer && i.installmentCode === installmentCode,
      );
      if (item && item.id) {
        try {
          await setDoc(
            doc(db, "installments", item.id),
            { phone: newPhone },
            { merge: true },
          );
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.UPDATE,
            `installments/${item.id}`,
          );
        }
      }
    }
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!isAdmin) {
        alert(
          "عذراً، لا تملك صلاحية رفع الملفات. هذه الميزة متاحة للمسؤول فقط.",
        );
        return;
      }
      const file = acceptedFiles[0];
      if (!file) return;

      let newData: InstallmentData[] = [];

      // Handle Excel files
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const reader = new FileReader();
        const excelDataPromise = new Promise<InstallmentData[]>(
          (resolve, reject) => {
            reader.onload = (e) => {
              try {
                const dataArr = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(dataArr, {
                  type: "array",
                  cellDates: true,
                });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                const mappedData: InstallmentData[] = jsonData.map(
                  (row: any) => {
                    // Normalize keys to handle spaces and case sensitivity
                    const normalizedRow: any = {};
                    Object.keys(row).forEach((key) => {
                      normalizedRow[key.trim().toLowerCase()] = row[key];
                    });

                    const getVal = (keys: string[]) => {
                      // Try original keys first
                      const originalKey = keys.find(
                        (k) => row[k] !== undefined,
                      );
                      if (originalKey) return row[originalKey];

                      // Try normalized keys
                      const normalizedKey = keys.find(
                        (k) =>
                          normalizedRow[k.trim().toLowerCase()] !== undefined,
                      );
                      return normalizedKey
                        ? normalizedRow[normalizedKey.trim().toLowerCase()]
                        : undefined;
                    };

                    const value = Number(
                      getVal(["القيمة", "Value", "قيمة القسط", "قيمة"]) || 0,
                    );
                    const collected = Number(
                      getVal(["المحصل", "Collected", "المسدد", "تم تحصيله"]) ||
                        0,
                    );
                    const remaining = Number(
                      getVal(["المتبقي", "Remaining", "الرصيد", "الباقي"]) || 0,
                    );

                    let netValue = Number(
                      getVal(["صافي القيمة", "Net Value", "الصافي", "صافي"]) ||
                        0,
                    );
                    if (netValue === 0) {
                      netValue = value > 0 ? value : collected + remaining;
                    }

                    // Handle Date formatting - Added more variations
                    let rawDate = getVal([
                      "التاريخ",
                      "Date",
                      "تاريخ الاستحقاق",
                      "تاريخ الاستحقاق للاقساط",
                      "تاريخ القسط",
                      "موعد السداد",
                      "تاريخ السداد",
                      "Due Date",
                      "Installment Date",
                    ]);

                    let formattedDate = "";
                    if (rawDate instanceof Date) {
                      formattedDate = rawDate.toISOString().split("T")[0];
                    } else if (typeof rawDate === "number") {
                      // Excel serial date
                      const date = new Date((rawDate - 25569) * 86400 * 1000);
                      formattedDate = date.toISOString().split("T")[0];
                    } else if (
                      typeof rawDate === "string" &&
                      rawDate.trim() !== ""
                    ) {
                      // Try to parse string date
                      const d = new Date(rawDate);
                      if (!isNaN(d.getTime())) {
                        formattedDate = d.toISOString().split("T")[0];
                      } else {
                        formattedDate = rawDate;
                      }
                    } else {
                      formattedDate = String(rawDate || "");
                    }

                    return {
                      customer:
                        getVal([
                          "العميل",
                          "Customer",
                          "اسم العميل",
                          "الاسم",
                          "اسم",
                        ]) || "",
                      project:
                        getVal([
                          "المشروع",
                          "Project",
                          "اسم المشروع",
                          "مشروع",
                        ]) || "",
                      unitCode:
                        getVal([
                          "الوحدة",
                          "Unit",
                          "رقم الوحدة",
                          "كود الوحدة",
                          "وحدة",
                        ]) || "",
                      type:
                        getVal(["النوع", "Type", "نوع القسط", "نوع"]) || "قسط",
                      installmentCode: String(
                        getVal([
                          "كود القسط",
                          "Installment Code",
                          "رقم القسط",
                          "كود",
                        ]) || Math.random().toString(36).substr(2, 9),
                      ),
                      date: formattedDate,
                      value: value,
                      netValue: netValue,
                      collected: collected,
                      remaining: remaining,
                      commercialPaper: String(
                        getVal([
                          "الورقة التجارية",
                          "Commercial Paper",
                          "شيك",
                          "سند",
                          "رقم الشيك",
                        ]) || "",
                      ),
                      notes:
                        getVal(["ملاحظات", "Notes", "البيان", "ملاحظة"]) || "",
                    };
                  },
                );
                resolve(mappedData);
              } catch (error) {
                reject(error);
              }
            };
            reader.readAsArrayBuffer(file);
          },
        );

        try {
          newData = await excelDataPromise;
        } catch (error) {
          console.error("Error parsing Excel:", error);
          alert("حدث خطأ أثناء تحليل ملف الإكسيل.");
          return;
        }
      } else {
        setIsAnalyzing(true);
        try {
          if (!isAIConfigured()) {
            throw new Error("MISSING_API_KEY");
          }
          const reader = new FileReader();
          const fileData = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const base64 = fileData.split(",")[1];
          const result = await analyzeCollectionPDF(base64);

          if (result && result.length > 0) {
            newData = result;
          } else {
            alert("لم يتم العثور على بيانات في الملف.");
            return;
          }
        } catch (error: any) {
          console.error("Error analyzing PDF:", error);
          if (error.message === "MISSING_API_KEY") {
            alert("تنبيه: مفتاح GEMINI_API_KEY غير متوفر.");
            setShowAiError(true);
          } else {
            alert("حدث خطأ أثناء تحليل الملف.");
          }
          return;
        } finally {
          setIsAnalyzing(false);
        }
      }

      if (newData.length > 0) {
        if (user) {
          // Save to Firestore with deterministic IDs to prevent duplication
          try {
            const batchPromises = newData.map((item) => {
              // Create a unique deterministic ID based on customer, project, unit and installment code
              // This ensures that re-uploading the same data updates existing records instead of duplicating them
              const deterministicId =
                `${item.customer}_${item.project}_${item.unitCode}_${item.installmentCode}`.replace(
                  /\s+/g,
                  "_",
                );
              const docRef = doc(db, "installments", deterministicId);

              return setDoc(
                docRef,
                {
                  ...item,
                  id: deterministicId,
                  uid: user.uid,
                  updatedAt: new Date().toISOString(),
                },
                { merge: true },
              );
            });
            await Promise.all(batchPromises);
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, "installments");
          }
        } else {
          setData(newData);
        }
      }
    },
    [user],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: false,
  } as any);

  const stats = useMemo((): DashboardStats => {
    const totalNet = data.reduce((sum, item) => sum + item.netValue, 0);

    // Logic Audit:
    // 1. If there's a commercial paper, it's NOT considered collected cash yet (per user request).
    // 2. We only count collected cash if there's no pending commercial paper.
    const totalCollected = data.reduce((sum, item) => {
      if (item.commercialPaper && item.commercialPaper.trim() !== "")
        return sum;
      return sum + item.collected;
    }, 0);

    const totalRemaining = data.reduce((sum, item) => sum + item.remaining, 0);

    const projects = Array.from(new Set(data.map((item) => item.project)));
    const projectStats = projects.map((p) => {
      const pData = data.filter((item) => item.project === p);
      return {
        name: String(p),
        collected: pData.reduce((sum, item) => {
          if (item.commercialPaper && item.commercialPaper.trim() !== "")
            return sum;
          return sum + item.collected;
        }, 0),
        remaining: pData.reduce((sum, item) => sum + item.remaining, 0),
        total: pData.reduce((sum, item) => sum + item.netValue, 0),
      };
    });

    const months = Array.from(
      new Set(
        data.map((item) =>
          item.date && item.date.length >= 7 ? item.date.substring(0, 7) : "",
        ),
      ),
    )
      .filter((m) => m !== "")
      .sort();
    const monthlyStats = months.map((m) => {
      const mData = data.filter((item) => item.date && item.date.startsWith(m));
      return {
        month: String(m),
        collected: mData.reduce((sum, item) => {
          if (item.commercialPaper && item.commercialPaper.trim() !== "")
            return sum;
          return sum + item.collected;
        }, 0),
        remaining: mData.reduce((sum, item) => sum + item.remaining, 0),
      };
    });

    return {
      totalNetValue: totalNet,
      totalCollected: totalCollected,
      totalRemaining: totalRemaining,
      collectionRate: totalNet > 0 ? (totalCollected / totalNet) * 100 : 0,
      projectStats,
      monthlyStats,
    };
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesSearch =
        item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.unitCode.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProject =
        filterProject === "الكل" || item.project === filterProject;

      let matchesDate = true;
      if (item.date && item.date !== "-" && item.date !== "0") {
        const itemDate = new Date(item.date);
        if (!isNaN(itemDate.getTime())) {
          if (startDate) {
            const start = new Date(startDate);
            if (itemDate < start) matchesDate = false;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (itemDate > end) matchesDate = false;
          }
        }
      } else if (startDate || endDate) {
        matchesDate = false;
      }

      return matchesSearch && matchesProject && matchesDate;
    });
  }, [data, searchTerm, filterProject, startDate, endDate]);

  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, item) => ({
        collected: acc.collected + item.collected,
        remaining: acc.remaining + item.remaining,
        netValue: acc.netValue + item.netValue,
      }),
      { collected: 0, remaining: 0, netValue: 0 },
    );
  }, [filteredData]);

  const handlePrint = () => {
    if (!isAdmin) {
      alert("عذراً، لا تملك صلاحية الطباعة. هذه الميزة متاحة للمسؤول فقط.");
      return;
    }
    window.print();
  };

  const handleExportExcel = async () => {
    if (!isAdmin) {
      alert("عذراً، لا تملك صلاحية التصدير. هذه الميزة متاحة للمسؤول فقط.");
      return;
    }

    const NAVY = "FF1E3A5F";
    const WHITE = "FFFFFFFF";
    const GOLD = "FFFBBF24";
    const STRIPE = "FFEFF6FF";

    const statusInfo = (item: InstallmentData) => {
      if (item.commercialPaper?.trim())
        return { label: "ورقة مالية", bg: "FFDBEAFE", fg: "FF1E40AF" };
      if (item.remaining <= 0)
        return { label: "مسدد بالكامل", bg: "FFDCFCE7", fg: "FF166534" };
      if (item.collected > 0)
        return { label: "مسدد جزئياً", bg: "FFFED7AA", fg: "FF9A3412" };
      return { label: "غير مسدد", bg: "FFFEE2E2", fg: "FF991B1B" };
    };

    const border = (color = "FFCBD5E1"): Partial<ExcelJS.Borders> => ({
      top: { style: "thin", color: { argb: color } },
      bottom: { style: "thin", color: { argb: color } },
      left: { style: "thin", color: { argb: color } },
      right: { style: "thin", color: { argb: color } },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "شركة الحصري للتطوير العقاري";
    wb.created = new Date();
    const ws = wb.addWorksheet("تقرير التحصيل", {
      views: [{ rightToLeft: true }],
    });
    const NCOLS = 11;

    // ── Row 1: Company name ──────────────────────────────────────
    ws.mergeCells(1, 1, 1, NCOLS);
    const r1 = ws.getCell("A1");
    r1.value = "شركة الحصري للتطوير العقاري";
    r1.font = { name: "Arial", size: 20, bold: true, color: { argb: WHITE } };
    r1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    r1.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 46;

    // ── Row 2: Report subtitle ───────────────────────────────────
    ws.mergeCells(2, 1, 2, NCOLS);
    const r2 = ws.getCell("A2");
    r2.value = `تقرير تحصيل الأقساط العقارية  —  ${new Date().toLocaleDateString("en-GB")}`;
    r2.font = { name: "Arial", size: 12, color: { argb: WHITE } };
    r2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    r2.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(2).height = 26;

    // ── Row 3: spacer ────────────────────────────────────────────
    ws.getRow(3).height = 6;

    // ── Rows 4-5: KPI section ────────────────────────────────────
    const kpis = [
      { label: "إجمالي القيمة الصافية", value: totals.netValue, fmt: "#,##0" },
      { label: "إجمالي المحصل", value: totals.collected, fmt: "#,##0" },
      { label: "إجمالي المتبقي", value: totals.remaining, fmt: "#,##0" },
      {
        label: "نسبة التحصيل",
        value: totals.netValue > 0 ? totals.collected / totals.netValue : 0,
        fmt: "0.0%",
      },
    ];
    const kpiRanges = [
      [1, 3],
      [4, 6],
      [7, 9],
      [10, 11],
    ];
    kpis.forEach(({ label, value, fmt }, i) => {
      const [c1, c2] = kpiRanges[i];
      ws.mergeCells(4, c1, 4, c2);
      ws.mergeCells(5, c1, 5, c2);
      const lc = ws.getCell(4, c1);
      lc.value = label;
      lc.font = { name: "Arial", size: 10, bold: true, color: { argb: NAVY } };
      lc.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      };
      lc.alignment = { horizontal: "center", vertical: "middle" };
      lc.border = border();
      const vc = ws.getCell(5, c1);
      vc.value = value;
      vc.numFmt = fmt;
      vc.font = { name: "Arial", size: 14, bold: true, color: { argb: NAVY } };
      vc.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" },
      };
      vc.alignment = { horizontal: "center", vertical: "middle" };
      vc.border = {
        ...border(),
        bottom: { style: "medium", color: { argb: NAVY } },
      };
    });
    ws.getRow(4).height = 22;
    ws.getRow(5).height = 30;

    // ── Row 6: spacer ────────────────────────────────────────────
    ws.getRow(6).height = 6;

    // ── Row 7: Column headers ────────────────────────────────────
    const headers = [
      "#",
      "العميل",
      "المشروع",
      "كود الوحدة",
      "تاريخ القسط",
      "صافي القسط",
      "المحصل",
      "المتبقي",
      "الورقة التجارية",
      "الحالة",
      "ملاحظات",
    ];
    const hRow = ws.getRow(7);
    headers.forEach((h, i) => {
      const c = hRow.getCell(i + 1);
      c.value = h;
      c.font = { name: "Arial", size: 11, bold: true, color: { argb: WHITE } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = {
        left: { style: "thin", color: { argb: "FF2D5A8E" } },
        right: { style: "thin", color: { argb: "FF2D5A8E" } },
      };
    });
    hRow.height = 28;

    // ── Rows 8+: Data ────────────────────────────────────────────
    filteredData.forEach((item, idx) => {
      const rn = idx + 8;
      const row = ws.getRow(rn);
      const bg = idx % 2 === 0 ? WHITE : STRIPE;
      const { label: statusLabel, bg: sBg, fg: sFg } = statusInfo(item);
      const parsedDate = item.date ? new Date(item.date) : null;

      const cells: [number, any, string?, string?][] = [
        [1, idx + 1],
        [2, item.customer],
        [3, item.project],
        [4, item.unitCode],
        [5, parsedDate, "dd/mm/yyyy"],
        [6, item.netValue, "#,##0"],
        [7, item.collected, "#,##0"],
        [8, item.remaining, "#,##0"],
        [9, item.commercialPaper || "-"],
        [10, statusLabel],
        [11, item.notes || "-"],
      ];

      cells.forEach(([col, val, fmt]) => {
        const c = row.getCell(col);
        c.value = val;
        if (fmt) c.numFmt = fmt;
        if (col === 10) {
          c.font = {
            name: "Arial",
            size: 10,
            bold: true,
            color: { argb: sFg },
          };
          c.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: sBg },
          };
        } else {
          c.font = { name: "Arial", size: 10 };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        }
        c.alignment = {
          horizontal: col <= 2 ? "right" : "center",
          vertical: "middle",
        };
        c.border = border();
      });
      row.height = 20;
    });

    // ── Totals row ───────────────────────────────────────────────
    const lastDataRow = filteredData.length + 7;
    const tRn = lastDataRow + 1;
    ws.mergeCells(tRn, 1, tRn, 5);
    const tLabel = ws.getCell(tRn, 1);
    tLabel.value = "الإجمالي";
    tLabel.font = {
      name: "Arial",
      size: 11,
      bold: true,
      color: { argb: NAVY },
    };
    tLabel.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GOLD },
    };
    tLabel.alignment = { horizontal: "center", vertical: "middle" };
    tLabel.border = { top: { style: "medium", color: { argb: NAVY } } };

    [6, 7, 8].forEach((col) => {
      const colLetter = String.fromCharCode(64 + col);
      const c = ws.getCell(tRn, col);
      c.value = { formula: `SUM(${colLetter}8:${colLetter}${lastDataRow})` };
      c.numFmt = "#,##0";
      c.font = { name: "Arial", size: 11, bold: true, color: { argb: NAVY } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = { top: { style: "medium", color: { argb: NAVY } } };
    });
    for (let col = 9; col <= NCOLS; col++) {
      const c = ws.getCell(tRn, col);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
      c.border = { top: { style: "medium", color: { argb: NAVY } } };
    }
    ws.getRow(tRn).height = 28;

    // ── Column widths ────────────────────────────────────────────
    ws.columns = [
      { width: 5 },
      { width: 30 },
      { width: 15 },
      { width: 22 },
      { width: 14 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 20 },
      { width: 16 },
      { width: 25 },
    ];

    // ── Save ─────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تقرير_التحصيل_${new Date().toLocaleDateString("en-CA")}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 dir-rtl print:p-0 print:m-0 print:bg-white"
      dir="rtl"
    >
      {/* Print-only Header */}
      <header
        className="hidden print:block mb-8"
        style={{ background: "#1e3a5f", color: "#fff", padding: "28px 40px" }}
      >
        <div className="flex justify-between items-center">
          <div>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 900,
                marginBottom: 4,
                letterSpacing: "-0.5px",
              }}
            >
              شركة الحصري للتطوير العقاري
            </h1>
            <p style={{ fontSize: 14, opacity: 0.8 }}>
              تقرير تحصيل الأقساط العقارية
            </p>
          </div>
          <div style={{ textAlign: "left", fontSize: 13, opacity: 0.85 }}>
            <p style={{ marginBottom: 2 }}>
              التاريخ: {new Date().toLocaleDateString("en-GB")}
            </p>
          </div>
        </div>
      </header>

      {/* Header (Screen Only) */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            لوحة تحكم التحصيل العقاري
          </h1>
          <p className="text-slate-500">
            تحليل احترافي لبيانات العملاء والأقساط المستحقة
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {user ? (
            <div className="flex items-center gap-3 ml-4 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-slate-800">
                  {user.displayName}
                </span>
                <span className="text-[10px] text-slate-500">{user.email}</span>
              </div>
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="w-8 h-8 rounded-full border border-indigo-100"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <UserIcon size={16} />
                </div>
              )}
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                title="تسجيل الخروج"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-indigo-200 text-indigo-600 rounded-lg shadow-sm hover:bg-indigo-50 transition-all active:scale-95 group cursor-pointer text-sm"
            >
              <LogIn
                size={18}
                className="group-hover:translate-x-1 transition-transform"
              />
              <span className="font-bold">تسجيل الدخول للحفظ</span>
            </button>
          )}
          {showAiError && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs animate-pulse">
              <AlertCircle size={16} />
              <span>مفتاح AI غير مفعل. يرجى ضبطه من الإعدادات.</span>
            </div>
          )}
          {isAdmin && (
            <div
              {...getRootProps()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-sm cursor-pointer hover:bg-indigo-700 transition-all active:scale-95 text-sm",
                isDragActive && "bg-indigo-800 scale-105",
              )}
            >
              <input {...getInputProps()} />
              {isAnalyzing ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Upload size={18} />
              )}
              <span className="font-bold">
                {isAnalyzing ? "جاري التحليل..." : "رفع ملف PDF / Excel"}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Navigation Tabs (Screen Only) */}
      <nav className="flex gap-4 mb-8 border-b border-slate-200 print:hidden">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={cn(
            "pb-4 px-2 font-bold text-sm transition-all relative",
            activeTab === "dashboard"
              ? "text-indigo-600"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          <div className="flex items-center gap-2">
            <TrendingUp size={18} />
            لوحة التحكم
          </div>
          {activeTab === "dashboard" && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab("reports")}
          className={cn(
            "pb-4 px-2 font-bold text-sm transition-all relative",
            activeTab === "reports"
              ? "text-indigo-600"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} />
            التقارير والطباعة
          </div>
          {activeTab === "reports" && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600"
            />
          )}
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="print:hidden">
        {activeTab === "dashboard" ? (
          <DashboardView
            isLoading={isLoading}
            user={user}
            isAdmin={isAdmin}
            stats={stats}
            data={data}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filterProject={filterProject}
            setFilterProject={setFilterProject}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            filteredData={filteredData}
            totals={totals}
            handleUpdateNote={handleUpdateNote}
            handleUpdatePhone={handleUpdatePhone}
            selectedRows={selectedRows}
            setSelectedRows={setSelectedRows}
          />
        ) : (
          <ReportsView
            stats={stats}
            filteredData={filteredData}
            handlePrint={handlePrint}
            handleExportExcel={handleExportExcel}
            isAdmin={isAdmin}
          />
        )}
      </main>

      {/* Print-only Sections */}
      <div
        className="hidden print:block"
        style={{ fontFamily: "Arial, sans-serif", direction: "rtl" }}
      >
        <style>{`
          @media print {
            @page { margin: 15mm 12mm; size: A4 landscape; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        `}</style>

        {/* KPI Summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {[
            {
              label: "إجمالي القيمة الصافية",
              value: formatCurrency(totals.netValue),
              border: "#6366f1",
            },
            {
              label: "إجمالي المحصل",
              value: formatCurrency(totals.collected),
              border: "#10b981",
            },
            {
              label: "إجمالي المتبقي",
              value: formatCurrency(totals.remaining),
              border: "#f43f5e",
            },
            {
              label: "نسبة التحصيل",
              value: `${stats.collectionRate.toFixed(1)}%`,
              border: "#f59e0b",
            },
          ].map(({ label, value, border: bc }) => (
            <div
              key={label}
              style={{
                border: `2px solid ${bc}`,
                borderRadius: 8,
                padding: "12px 16px",
                background: "#fafafa",
              }}
            >
              <p style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                {label}
              </p>
              <p style={{ fontSize: 18, fontWeight: 900, color: "#1e293b" }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Table */}
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}
        >
          <thead>
            <tr style={{ background: "#1e3a5f", color: "#fff" }}>
              {[
                "#",
                "العميل",
                "المشروع",
                "كود الوحدة",
                "التاريخ",
                "صافي القسط",
                "المحصل",
                "المتبقي",
                "الورقة التجارية",
                "الحالة",
                "ملاحظات",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 6px",
                    fontWeight: 700,
                    textAlign: "center",
                    border: "1px solid #2d5a8e",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, idx) => {
              const isEven = idx % 2 === 0;
              const status = item.commercialPaper?.trim()
                ? "ورقة مالية"
                : item.remaining <= 0
                  ? "مسدد بالكامل"
                  : item.collected > 0
                    ? "مسدد جزئياً"
                    : "غير مسدد";
              const statusColor =
                status === "مسدد بالكامل"
                  ? "#166534"
                  : status === "مسدد جزئياً"
                    ? "#9a3412"
                    : status === "ورقة مالية"
                      ? "#1e40af"
                      : "#991b1b";
              return (
                <tr
                  key={idx}
                  style={{ background: isEven ? "#fff" : "#eff6ff" }}
                >
                  <td
                    style={{
                      padding: "6px",
                      textAlign: "center",
                      border: "1px solid #e2e8f0",
                      color: "#64748b",
                    }}
                  >
                    {idx + 1}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      border: "1px solid #e2e8f0",
                      fontWeight: 700,
                    }}
                  >
                    {item.customer}
                  </td>
                  <td
                    style={{
                      padding: "6px",
                      textAlign: "center",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {item.project}
                  </td>
                  <td
                    style={{
                      padding: "6px",
                      textAlign: "center",
                      border: "1px solid #e2e8f0",
                      fontSize: 9,
                      fontFamily: "monospace",
                    }}
                  >
                    {item.unitCode}
                  </td>
                  <td
                    style={{
                      padding: "6px",
                      textAlign: "center",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {formatDate(item.date)}
                  </td>
                  <td
                    style={{
                      padding: "6px",
                      textAlign: "center",
                      border: "1px solid #e2e8f0",
                      fontWeight: 700,
                    }}
                  >
                    {formatCurrency(item.netValue)}
                  </td>
                  <td
                    style={{
                      padding: "6px",
                      textAlign: "center",
                      border: "1px solid #e2e8f0",
                      fontWeight: 700,
                      color: "#166534",
                    }}
                  >
                    {formatCurrency(item.collected)}
                  </td>
                  <td
                    style={{
                      padding: "6px",
                      textAlign: "center",
                      border: "1px solid #e2e8f0",
                      fontWeight: 700,
                      color: "#991b1b",
                    }}
                  >
                    {formatCurrency(item.remaining)}
                  </td>
                  <td
                    style={{
                      padding: "6px",
                      textAlign: "center",
                      border: "1px solid #e2e8f0",
                      fontSize: 9,
                      fontFamily: "monospace",
                    }}
                  >
                    {item.commercialPaper || "-"}
                  </td>
                  <td
                    style={{
                      padding: "6px",
                      textAlign: "center",
                      border: "1px solid #e2e8f0",
                      fontWeight: 700,
                      color: statusColor,
                    }}
                  >
                    {status}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      border: "1px solid #e2e8f0",
                      fontSize: 9,
                      color: "#64748b",
                    }}
                  >
                    {item.notes || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "#fbbf24", fontWeight: 700 }}>
              <td
                colSpan={5}
                style={{
                  padding: "8px",
                  textAlign: "center",
                  border: "1px solid #d97706",
                  color: "#1e3a5f",
                  fontSize: 11,
                }}
              >
                الإجمالي
              </td>
              <td
                style={{
                  padding: "8px",
                  textAlign: "center",
                  border: "1px solid #d97706",
                  color: "#1e3a5f",
                }}
              >
                {formatCurrency(totals.netValue)}
              </td>
              <td
                style={{
                  padding: "8px",
                  textAlign: "center",
                  border: "1px solid #d97706",
                  color: "#1e3a5f",
                }}
              >
                {formatCurrency(totals.collected)}
              </td>
              <td
                style={{
                  padding: "8px",
                  textAlign: "center",
                  border: "1px solid #d97706",
                  color: "#1e3a5f",
                }}
              >
                {formatCurrency(totals.remaining)}
              </td>
              <td colSpan={3} style={{ border: "1px solid #d97706" }}></td>
            </tr>
          </tfoot>
        </table>

        {/* Signatures */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 40,
            marginTop: 60,
          }}
        >
          {["إعداد المحاسب", "المراجعة المالية", "اعتماد المدير العام"].map(
            (label) => (
              <div key={label} style={{ textAlign: "center" }}>
                <p
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: "#1e293b",
                    marginBottom: 40,
                  }}
                >
                  {label}
                </p>
                <div
                  style={{
                    borderBottom: "1.5px solid #1e293b",
                    width: 180,
                    margin: "0 auto",
                  }}
                ></div>
                <p style={{ marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
                  التوقيع
                </p>
              </div>
            ),
          )}
        </div>

        {/* Footer bar */}
        <div
          style={{
            marginTop: 32,
            paddingTop: 12,
            borderTop: "1px solid #cbd5e1",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "#94a3b8",
          }}
        >
          <span>شركة الحصري للتطوير العقاري</span>
          <span>تاريخ الطباعة: {new Date().toLocaleDateString("en-GB")}</span>
        </div>
      </div>
    </div>
  );
}

function DashboardView({
  isLoading,
  user,
  isAdmin,
  stats,
  data,
  searchTerm,
  setSearchTerm,
  filterProject,
  setFilterProject,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  filteredData,
  totals,
  handleUpdateNote,
  handleUpdatePhone,
  selectedRows,
  setSelectedRows,
}: any) {
  const buildWhatsAppMessage = (item: InstallmentData) =>
    `السلام عليكم ورحمة الله وبركاته\nعزيزنا ${item.customer}،\nنود تذكيركم بموعد سداد قسطكم:\n🏢 المشروع: ${item.project}\n🏠 الوحدة: ${item.unitCode}\n📅 تاريخ القسط: ${formatDate(item.date)}\n💰 صافي القيمة: ${formatCurrency(item.netValue)}\n✅ المحصل: ${formatCurrency(item.collected)}\n💳 المتبقي: ${formatCurrency(item.remaining)}\n\nشركة الحصري للتطوير العقاري`;

  const openWhatsApp = (item: InstallmentData) => {
    const phone = item.phone?.replace(/\D/g, "");
    if (!phone) return;
    const text = encodeURIComponent(buildWhatsAppMessage(item));
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
  };

  const toggleRow = (key: string) => {
    setSelectedRows((prev: Set<string>) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const allKeys = filteredData.map(
    (item: InstallmentData) => `${item.customer}_${item.installmentCode}`,
  );
  const allSelected =
    allKeys.length > 0 && allKeys.every((k: string) => selectedRows.has(k));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedRows((prev: Set<string>) => {
        const next = new Set(prev);
        allKeys.forEach((k: string) => next.delete(k));
        return next;
      });
    } else {
      setSelectedRows((prev: Set<string>) => {
        const next = new Set(prev);
        allKeys.forEach((k: string) => next.add(k));
        return next;
      });
    }
  };

  const sendBulkWhatsApp = () => {
    const selected = filteredData.filter((item: InstallmentData) =>
      selectedRows.has(`${item.customer}_${item.installmentCode}`),
    );
    const withPhone = selected.filter((item: InstallmentData) =>
      item.phone?.trim(),
    );
    const withoutPhone = selected.length - withPhone.length;
    if (withPhone.length === 0) {
      alert("لا يوجد أرقام واتساب مسجلة للعملاء المحددين.");
      return;
    }
    if (withoutPhone > 0) {
      alert(`تنبيه: ${withoutPhone} عميل بدون رقم واتساب وسيتم تخطيهم.`);
    }
    withPhone.forEach((item: InstallmentData) => openWhatsApp(item));
  };

  return (
    <>
      {/* KPI Cards */}
      {isLoading && user ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-indigo-600" size={48} />
          <span className="mr-4 text-xl font-bold text-slate-600">
            جاري تحميل بياناتك السحابية...
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KpiCard
            title="إجمالي القيمة الصافية"
            value={formatCurrency(stats.totalNetValue)}
            icon={<DollarSign className="text-indigo-600" />}
            trend="المستحق"
            color="indigo"
          />
          <KpiCard
            title="إجمالي المحصل الفعلي"
            value={formatCurrency(stats.totalCollected)}
            icon={<CheckCircle2 className="text-emerald-600" />}
            trend={`${stats.collectionRate.toFixed(1)}%`}
            color="emerald"
          />
          <KpiCard
            title="إجمالي المتبقي"
            value={formatCurrency(stats.totalRemaining)}
            icon={<AlertCircle className="text-rose-600" />}
            trend="متأخرات"
            color="rose"
          />
          <KpiCard
            title="عدد العملاء"
            value={data.length.toString()}
            icon={<Users className="text-amber-600" />}
            trend="نشط"
            color="amber"
          />
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <PieChartIcon size={20} className="text-indigo-600" />
            توزيع التحصيل حسب المشروع
          </h3>
          <div className="h-[300px]">
            {stats.projectStats.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={100}
              >
                <PieChart>
                  <Pie
                    data={stats.projectStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="collected"
                    nameKey="name"
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                  >
                    {stats.projectStats.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          [
                            "#6366f1",
                            "#10b981",
                            "#f43f5e",
                            "#f59e0b",
                            "#8b5cf6",
                          ][index % 5]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                لا توجد بيانات للمشاريع
              </div>
            )}
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-600" />
            التدفق المالي الشهري
          </h3>
          <div className="h-[300px]">
            {stats.monthlyStats.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={100}
              >
                <AreaChart
                  data={stats.monthlyStats}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis
                    tickFormatter={(v) =>
                      v >= 1000000
                        ? `${(v / 1000000).toFixed(1)}M`
                        : v >= 1000
                          ? `${(v / 1000).toFixed(0)}K`
                          : v
                    }
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Area
                    type="monotone"
                    dataKey="collected"
                    name="المحصل"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.1}
                  />
                  <Area
                    type="monotone"
                    dataKey="remaining"
                    name="المتبقي"
                    stroke="#f43f5e"
                    fill="#f43f5e"
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                لا توجد بيانات شهرية
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h3 className="text-lg font-semibold">تفاصيل العملاء والأقساط</h3>
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Calendar
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
                  placeholder="من تاريخ"
                />
              </div>
              <span className="text-slate-400 text-xs">إلى</span>
              <div className="relative">
                <Calendar
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs"
                  placeholder="إلى تاريخ"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                  title="مسح الفلتر"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="relative flex-1 md:w-64">
              <Search
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="بحث عن عميل أو وحدة..."
                className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
            >
              <option value="الكل">كل المشاريع</option>
              {Array.from(new Set(data.map((item: any) => item.project))).map(
                (p: any) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                {isAdmin && (
                  <th className="px-4 py-4 text-center w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                      title="تحديد الكل"
                    />
                  </th>
                )}
                <th className="px-6 py-4 font-bold text-right min-w-[150px]">
                  العميل
                </th>
                <th className="px-6 py-4 font-bold text-right">المشروع</th>
                <th className="px-6 py-4 font-bold text-right max-w-[100px]">
                  الوحدة
                </th>
                <th className="px-6 py-4 font-bold text-right">التاريخ</th>
                <th className="px-6 py-4 font-bold text-right">صافي القيمة</th>
                <th className="px-6 py-4 font-bold text-center">المحصل</th>
                <th className="px-6 py-4 font-bold text-center">المتبقي</th>
                <th className="px-6 py-4 font-bold text-right min-w-[150px]">
                  الورقة التجارية
                </th>
                <th className="px-6 py-4 font-bold text-center">الحالة</th>
                <th className="px-6 py-4 font-bold text-right min-w-[130px]">
                  رقم الواتساب
                </th>
                <th className="px-6 py-4 font-bold text-right min-w-[250px]">
                  ملاحظات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence>
                {filteredData.map((item: any, idx: number) => {
                  const rowKey = `${item.customer}_${item.installmentCode}`;
                  const isSelected = selectedRows.has(rowKey);
                  return (
                    <motion.tr
                      key={`${item.customer}-${item.installmentCode}-${idx}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={cn(
                        "transition-colors group",
                        isSelected ? "bg-green-50" : "hover:bg-slate-50",
                      )}
                    >
                      {isAdmin && (
                        <td className="px-4 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(rowKey)}
                            className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 font-bold text-slate-900 whitespace-normal break-words leading-relaxed min-w-[150px]">
                        {item.customer}
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm">
                        {item.project}
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm font-mono max-w-[100px] whitespace-normal break-words leading-relaxed">
                        {item.unitCode}
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {formatDate(item.date)}
                      </td>
                      <td className="px-6 py-4 text-slate-900 font-black">
                        {formatCurrency(item.netValue)}
                      </td>
                      <td className="px-6 py-4 text-emerald-600 font-black text-center">
                        {formatCurrency(item.collected)}
                      </td>
                      <td className="px-6 py-4 text-rose-600 font-black text-center">
                        {formatCurrency(item.remaining)}
                      </td>
                      <td className="px-6 py-4 text-indigo-600 font-mono text-xs tracking-tighter">
                        {item.commercialPaper || "-"}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {item.commercialPaper &&
                        item.commercialPaper.trim() !== "" ? (
                          <span className="inline-flex px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[10px] rounded-full font-black uppercase tracking-wider">
                            ورقة مالية
                          </span>
                        ) : item.remaining <= 0 ? (
                          <span className="inline-flex px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-black uppercase tracking-wider">
                            مسدد
                          </span>
                        ) : item.collected > 0 ? (
                          <span className="inline-flex px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] rounded-full font-black uppercase tracking-wider">
                            جزئي
                          </span>
                        ) : (
                          <span className="inline-flex px-2.5 py-1 bg-rose-100 text-rose-700 text-[10px] rounded-full font-black uppercase tracking-wider">
                            متأخر
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          {isAdmin ? (
                            <input
                              type="tel"
                              key={item.id}
                              defaultValue={item.phone || ""}
                              onBlur={(e) =>
                                handleUpdatePhone(
                                  item.customer,
                                  item.installmentCode,
                                  e.target.value,
                                )
                              }
                              className="w-full bg-transparent border-b border-transparent group-hover:border-slate-200 focus:border-green-500 focus:outline-none transition-all py-1 text-xs font-mono"
                              placeholder="201012345678"
                            />
                          ) : (
                            <span className="text-xs font-mono text-slate-500">
                              {item.phone || ""}
                            </span>
                          )}
                          {item.phone?.trim() && (
                            <button
                              onClick={() => openWhatsApp(item)}
                              className="flex-shrink-0 p-1.5 rounded-lg bg-green-100 text-green-600 hover:bg-green-200 transition-colors"
                              title="إرسال رسالة واتساب"
                            >
                              <MessageCircle size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {isAdmin ? (
                          <input
                            type="text"
                            value={item.notes || ""}
                            onChange={(e) =>
                              handleUpdateNote(
                                item.customer,
                                item.installmentCode,
                                e.target.value,
                              )
                            }
                            className="w-full bg-transparent border-b border-transparent group-hover:border-slate-200 focus:border-indigo-500 focus:outline-none transition-all py-1 text-xs italic"
                            placeholder="أضف ملاحظة..."
                          />
                        ) : (
                          <span className="text-xs italic">
                            {item.notes || ""}
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
            <tfoot className="bg-slate-50/50 font-bold border-t-2 border-slate-200">
              <tr>
                <td
                  colSpan={isAdmin ? 5 : 4}
                  className="px-6 py-4 text-slate-700"
                >
                  الإجمالي للمجموعة الحالية
                </td>
                <td className="px-6 py-4 text-slate-900">
                  {formatCurrency(totals.netValue)}
                </td>
                <td className="px-6 py-4 text-emerald-700 text-center">
                  {formatCurrency(totals.collected)}
                </td>
                <td className="px-6 py-4 text-rose-700 text-center">
                  {formatCurrency(totals.remaining)}
                </td>
                <td colSpan={isAdmin ? 4 : 3} className="px-6 py-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Bulk WhatsApp floating bar */}
      {isAdmin && selectedRows.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl">
          <span className="text-sm font-bold">
            تم تحديد {selectedRows.size} عميل
          </span>
          <button
            onClick={sendBulkWhatsApp}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-400 rounded-xl font-bold text-sm transition-colors"
          >
            <MessageCircle size={18} />
            إرسال واتساب للمحددين
          </button>
          <button
            onClick={() => setSelectedRows(new Set())}
            className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
            title="إلغاء التحديد"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

function ReportsView({
  stats,
  filteredData,
  handlePrint,
  handleExportExcel,
  isAdmin,
}: any) {
  return (
    <div className="space-y-8">
      {/* Reports Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            مركز التقارير والطباعة
          </h2>
          <p className="text-slate-500 text-sm">
            استخرج تقارير مفصلة وقم بطباعتها أو تصديرها
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-3">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl shadow-md hover:bg-emerald-700 transition-all active:scale-95 font-bold"
            >
              <FileSpreadsheet size={20} />
              تصدير Excel
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl shadow-md hover:bg-indigo-700 transition-all active:scale-95 font-bold"
            >
              <Printer size={20} />
              طباعة التقرير (PDF)
            </button>
          </div>
        )}
      </div>

      {/* Summary Stats for Reports */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-500 text-sm mb-1">إجمالي المستحق</p>
          <p className="text-2xl font-bold text-slate-800">
            {formatCurrency(stats.totalNetValue)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-500 text-sm mb-1">المحصل الفعلي</p>
          <p className="text-2xl font-bold text-emerald-600">
            {formatCurrency(stats.totalCollected)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-slate-500 text-sm mb-1">المتبقي للتحصيل</p>
          <p className="text-2xl font-bold text-rose-600">
            {formatCurrency(stats.totalRemaining)}
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <PieChartIcon size={20} className="text-indigo-600" />
            توزيع التحصيل حسب المشروع
          </h3>
          <div className="h-[350px] w-full min-h-[350px]">
            {stats.projectStats.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={100}
                minHeight={350}
              >
                <PieChart>
                  <Pie
                    data={stats.projectStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="collected"
                    nameKey="name"
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                  >
                    {stats.projectStats.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          [
                            "#6366f1",
                            "#10b981",
                            "#f43f5e",
                            "#f59e0b",
                            "#8b5cf6",
                          ][index % 5]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                لا توجد بيانات للمشاريع
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-600" />
            التدفق المالي الشهري
          </h3>
          <div className="h-[350px] w-full min-h-[350px]">
            {stats.monthlyStats.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                debounce={100}
                minHeight={350}
              >
                <AreaChart
                  data={stats.monthlyStats}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis
                    tickFormatter={(v) =>
                      v >= 1000000
                        ? `${(v / 1000000).toFixed(1)}M`
                        : v >= 1000
                          ? `${(v / 1000).toFixed(0)}K`
                          : v
                    }
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Area
                    type="monotone"
                    dataKey="collected"
                    name="المحصل"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                لا توجد بيانات شهرية
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Project Breakdown Table */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold mb-6">تحليل المشاريع</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="text-slate-500 text-xs font-black uppercase tracking-wider border-b border-slate-100">
                <th className="pb-4 text-right">المشروع</th>
                <th className="pb-4 text-right">المستحق</th>
                <th className="pb-4 text-right">المحصل</th>
                <th className="pb-4 text-right">المتبقي</th>
                <th className="pb-4 text-center">نسبة الإنجاز</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.projectStats.map((p: any) => (
                <tr
                  key={p.name}
                  className="hover:bg-slate-50/50 transition-colors"
                >
                  <td className="py-4 font-black text-slate-800">{p.name}</td>
                  <td className="py-4 font-bold">{formatCurrency(p.total)}</td>
                  <td className="py-4 text-emerald-600 font-bold">
                    {formatCurrency(p.collected)}
                  </td>
                  <td className="py-4 text-rose-600 font-bold">
                    {formatCurrency(p.remaining)}
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-3 justify-center">
                      <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                          style={{ width: `${(p.collected / p.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-black text-slate-700">
                        {((p.collected / p.total) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  trend,
  color,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-50 border-indigo-100",
    emerald: "bg-emerald-50 border-emerald-100",
    rose: "bg-rose-50 border-rose-100",
    amber: "bg-amber-50 border-amber-100",
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4 print:shadow-none print:border-slate-300"
    >
      <div className="flex justify-between items-start">
        <div className={cn("p-3 rounded-xl border", colorMap[color])}>
          {icon}
        </div>
        <span
          className={cn(
            "text-xs font-bold px-2 py-1 rounded-full",
            color === "emerald"
              ? "bg-emerald-100 text-emerald-700"
              : color === "rose"
                ? "bg-rose-100 text-rose-700"
                : "bg-slate-100 text-slate-600",
          )}
        >
          {trend}
        </span>
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
      </div>
    </motion.div>
  );
}
