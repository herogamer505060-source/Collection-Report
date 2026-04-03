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
  useRef,
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
  TrendingDown,
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
  Trash2,
  Bot,
  Send,
  Bell,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";
import { InstallmentData, DashboardStats } from "./types";
import {
  analyzeCollectionPDF,
  getAIStatus,
  createDataChatSession,
} from "./services/geminiService";
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
  getDocs,
  handleFirestoreError,
  OperationType,
} from "./firebase";
import { User } from "firebase/auth";

type InstallmentStatus = "commercialPaper" | "paid" | "partial" | "overdue";
type ChatMessage = { role: "user" | "model"; text: string; timestamp: number };

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string | null;
}

type StateSetter<T> = React.Dispatch<React.SetStateAction<T>>;

interface DashboardViewProps {
  isLoading: boolean;
  user: User | null;
  isAdmin: boolean;
  stats: DashboardStats;
  data: InstallmentData[];
  searchTerm: string;
  setSearchTerm: StateSetter<string>;
  filterProject: string;
  setFilterProject: StateSetter<string>;
  filterStatus: string;
  setFilterStatus: StateSetter<string>;
  startDate: string;
  setStartDate: StateSetter<string>;
  endDate: string;
  setEndDate: StateSetter<string>;
  filteredData: InstallmentData[];
  totals: {
    collected: number;
    remaining: number;
    netValue: number;
  };
  handleUpdateNote: (
    customer: string,
    installmentCode: string,
    newNote: string,
  ) => Promise<void>;
  handleUpdateCollected: (
    customer: string,
    installmentCode: string,
    val: number,
  ) => Promise<void>;
  handleUpdatePhone: (
    customer: string,
    installmentCode: string,
    newPhone: string,
  ) => Promise<void>;
  selectedRows: Set<string>;
  setSelectedRows: StateSetter<Set<string>>;
}

interface ReportsViewProps {
  stats: DashboardStats;
  filteredData: InstallmentData[];
  handlePrint: () => void;
  handleExportExcel: () => void;
  isAdmin: boolean;
}

const INSTALLMENT_STATUS_META: Record<
  InstallmentStatus,
  {
    filterLabel: string;
    badgeLabel: string;
    exportLabel: string;
    badgeClassName: string;
  }
> = {
  commercialPaper: {
    filterLabel: "ورقة مالية",
    badgeLabel: "ورقة مالية",
    exportLabel: "بانتظار التحصيل (ورقة)",
    badgeClassName:
      "bg-indigo-100 text-indigo-700 text-[10px] rounded-full font-black uppercase tracking-wider",
  },
  paid: {
    filterLabel: "مسدد",
    badgeLabel: "مسدد",
    exportLabel: "مسدد بالكامل",
    badgeClassName:
      "bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-black uppercase tracking-wider",
  },
  partial: {
    filterLabel: "جزئي",
    badgeLabel: "جزئي",
    exportLabel: "مسدد جزئياً",
    badgeClassName:
      "bg-amber-100 text-amber-700 text-[10px] rounded-full font-black uppercase tracking-wider",
  },
  overdue: {
    filterLabel: "متأخر",
    badgeLabel: "متأخر",
    exportLabel: "غير مسدد",
    badgeClassName:
      "bg-rose-100 text-rose-700 text-[10px] rounded-full font-black uppercase tracking-wider",
  },
};

// Error Boundary Component
class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  declare state: ErrorBoundaryState;
  declare props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorInfo: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let displayError = "حدث خطأ غير متوقع.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || "{}");
        if (parsed.error) {
          displayError = `خطأ في قاعدة البيانات: ${parsed.error}`;
        }
      } catch {
        displayError = this.state.errorInfo || displayError;
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

    return this.props.children;
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

const getInstallmentStatus = (
  item: Pick<InstallmentData, "commercialPaper" | "remaining" | "collected">,
): InstallmentStatus => {
  const hasCommercialPaper = !!(
    item.commercialPaper && item.commercialPaper.trim() !== ""
  );

  if (hasCommercialPaper) return "commercialPaper";
  if (item.remaining <= 0) return "paid";
  if (item.collected > 0) return "partial";
  return "overdue";
};

const getCollectionRate = (collected: number, total: number) => {
  if (total <= 0) return 0;
  return (collected / total) * 100;
};

const buildInstallmentKey = (
  item: Pick<InstallmentData, "customer" | "installmentCode">,
) => `${item.customer}_${item.installmentCode}`;

const createFallbackInstallmentCode = (
  row: Record<string, unknown>,
  formattedDate: string,
  value: number,
  netValue: number,
  collected: number,
  remaining: number,
) => {
  const stableParts = [
    row["العميل"] ??
      row["Customer"] ??
      row["اسم العميل"] ??
      row["الاسم"] ??
      row["اسم"] ??
      "",
    row["المشروع"] ?? row["Project"] ?? row["اسم المشروع"] ?? row["مشروع"] ?? "",
    row["الوحدة"] ??
      row["Unit"] ??
      row["رقم الوحدة"] ??
      row["كود الوحدة"] ??
      row["وحدة"] ??
      "",
    formattedDate,
    value,
    netValue,
    collected,
    remaining,
  ];

  return (
    stableParts
      .map((part) => String(part).trim())
      .join("_")
      .replace(/\s+/g, "_")
      .replace(/[^\w\u0600-\u06FF-]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "installment"
  );
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
  const [isAIConfigured, setIsAIConfigured] = useState(false);
  const [showAiError, setShowAiError] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProject, setFilterProject] = useState("الكل");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "reports">(
    "dashboard",
  );
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [reportNumber] = useState(() => `${Date.now()}`.slice(-5));

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const chatSessionRef = useRef<ReturnType<typeof createDataChatSession> | null>(
    null,
  );
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const isAdmin = useMemo(() => user?.email === ADMIN_EMAIL, [user]);
  const today = new Date().toISOString().slice(0, 10);
  const weekLater = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const dueToday = useMemo(
    () => data.filter((item) => item.date === today && item.remaining > 0),
    [data, today],
  );
  const dueSoon = useMemo(
    () =>
      data.filter(
        (item) =>
          item.date > today && item.date <= weekLater && item.remaining > 0,
      ),
    [data, today, weekLater],
  );
  const notificationCount = dueToday.length + dueSoon.length;

  // Handle Chat Send
  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading || data.length === 0) return;

    const question = chatInput.trim();
    setChatInput("");
    setIsChatLoading(true);

    const userMsg: ChatMessage = { role: "user", text: question, timestamp: Date.now() };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      if (!chatSessionRef.current) {
        chatSessionRef.current = createDataChatSession(data);
      }

      const result = await chatSessionRef.current.sendMessage({ message: question });
      const modelMsg: ChatMessage = { role: "model", text: result.text, timestamp: Date.now() };
      setChatMessages((prev) => [...prev, modelMsg]);
    } catch (error) {
      console.error("Chat Error:", error);
      if (error instanceof Error && error.message === "MISSING_API_KEY") {
        setIsAIConfigured(false);
        setShowAiError(true);
      }
      const errorText =
        error instanceof Error && error.message !== "GEMINI_REQUEST_FAILED"
          ? `عذراً، حدث خطأ أثناء الاتصال بـ Gemini: ${error.message}`
          : "عذراً، حدث خطأ أثناء الاتصال بـ Gemini. يرجى المحاولة مرة أخرى.";
      const errMsg: ChatMessage = { role: "model", text: errorText, timestamp: Date.now() };
      setChatMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, data]);

  const handleChatClear = useCallback(() => {
    chatSessionRef.current = null;
    setChatMessages([]);
    setChatInput("");
  }, []);

  // Effects
  useEffect(() => {
    if (isChatOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatLoading, isChatOpen]);

  useEffect(() => {
    let isMounted = true;

    getAIStatus()
      .then((configured) => {
        if (isMounted) {
          setIsAIConfigured(configured);
          setShowAiError(!configured);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsAIConfigured(false);
          setShowAiError(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    chatSessionRef.current = null;
  }, [data]);

  useEffect(() => {
    if (!showNotifications) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (notificationsRef.current?.contains(event.target as Node)) return;
      setShowNotifications(false);
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showNotifications]);

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
    if (!isAuthReady) return;

    setIsLoading(true);

    let q;
    if (user) {
      // If admin, fetch public data. Otherwise fetch user's own data.
      if (isAdmin) {
        q = query(collection(db, "installments"), where("uid", "==", "public"));
      } else {
        q = query(collection(db, "installments"), where("uid", "==", user.uid));
      }
    } else {
      // Not logged in: fetch public data
      q = query(collection(db, "installments"), where("uid", "==", "public"));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const installments: InstallmentData[] = [];
        snapshot.forEach((doc) => {
          installments.push({ id: doc.id, ...doc.data() } as InstallmentData);
        });

        // If no data found and not logged in, show sample data
        // If logged in and no data, show empty or sample
        if (installments.length === 0 && !user) {
          setData(SAMPLE_DATA);
        } else {
          setData(installments);
        }
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        handleFirestoreError(error, OperationType.GET, "installments");
      },
    );

    return () => unsubscribe();
  }, [isAuthReady, isAdmin, user]);

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

  const handleDeleteAll = async () => {
    if (!isAdmin) return;
    if (
      !window.confirm(
        "هل أنت متأكد من حذف جميع البيانات الحالية؟ لا يمكن التراجع عن هذا الإجراء.",
      )
    )
      return;

    setIsLoading(true);
    try {
      const q = query(
        collection(db, "installments"),
        where("uid", "==", "public"),
      );
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      alert("تم حذف جميع البيانات بنجاح.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "installments");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateNote = useCallback(async (
    customer: string,
    installmentCode: string,
    newNote: string,
  ) => {
    const item = data.find(
      (i) => i.customer === customer && i.installmentCode === installmentCode,
    );

    // Optimistic update
    setData((prev) =>
      prev.map((item) =>
        item.customer === customer && item.installmentCode === installmentCode
          ? { ...item, notes: newNote }
          : item,
      ),
    );

    if (user) {
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
  }, [data, user]);

  const handleUpdateCollected = useCallback(async (
    customer: string,
    installmentCode: string,
    newCollected: number,
  ) => {
    const item = data.find(
      (i) => i.customer === customer && i.installmentCode === installmentCode,
    );
    if (!item) return;

    const safeCollected = Number.isFinite(newCollected)
      ? newCollected
      : item.collected;
    const clamped = Math.min(Math.max(0, safeCollected), item.netValue);
    const newRemaining = item.netValue - clamped;

    setData((prev) =>
      prev.map((i) =>
        i.customer === customer && i.installmentCode === installmentCode
          ? { ...i, collected: clamped, remaining: newRemaining }
          : i,
      ),
    );

    if (user && item.id) {
      try {
        await setDoc(
          doc(db, "installments", item.id),
          { collected: clamped, remaining: newRemaining },
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
  }, [data, user]);

  const handleUpdatePhone = useCallback(async (
    customer: string,
    installmentCode: string,
    newPhone: string,
  ) => {
    const item = data.find(
      (i) => i.customer === customer && i.installmentCode === installmentCode,
    );

    setData((prev) =>
      prev.map((item) =>
        item.customer === customer && item.installmentCode === installmentCode
          ? { ...item, phone: newPhone }
          : item,
      ),
    );

    if (user) {
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
  }, [data, user]);

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
                  (row) => {
                    const typedRow = row as Record<string, unknown>;
                    const normalizedRow: Record<string, unknown> = {};
                    Object.keys(typedRow).forEach((key) => {
                      normalizedRow[key.trim().toLowerCase()] = typedRow[key];
                    });

                    const getVal = (keys: string[]) => {
                      const originalKey = keys.find(
                        (k) => typedRow[k] !== undefined,
                      );
                      if (originalKey) return typedRow[originalKey];

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
                      const date = new Date((rawDate - 25569) * 86400 * 1000);
                      formattedDate = date.toISOString().split("T")[0];
                    } else if (
                      typeof rawDate === "string" &&
                      rawDate.trim() !== ""
                    ) {
                      const d = new Date(rawDate);
                      formattedDate = !isNaN(d.getTime())
                        ? d.toISOString().split("T")[0]
                        : rawDate;
                    } else {
                      formattedDate = String(rawDate || "");
                    }

                    const fallbackInstallmentCode = createFallbackInstallmentCode(
                      typedRow,
                      formattedDate,
                      value,
                      netValue,
                      collected,
                      remaining,
                    );

                    return {
                      customer: String(
                        getVal([
                          "العميل",
                          "Customer",
                          "اسم العميل",
                          "الاسم",
                          "اسم",
                        ]) || "",
                      ),
                      project: String(
                        getVal([
                          "المشروع",
                          "Project",
                          "اسم المشروع",
                          "مشروع",
                        ]) || "",
                      ),
                      unitCode: String(
                        getVal([
                          "الوحدة",
                          "Unit",
                          "رقم الوحدة",
                          "كود الوحدة",
                          "وحدة",
                        ]) || "",
                      ),
                      type: String(
                        getVal(["النوع", "Type", "نوع القسط", "نوع"]) || "قسط",
                      ),
                      installmentCode: String(
                        getVal([
                          "كود القسط",
                          "Installment Code",
                          "رقم القسط",
                          "كود",
                        ]) || fallbackInstallmentCode,
                      ),
                      date: formattedDate,
                      value,
                      netValue,
                      collected,
                      remaining,
                      commercialPaper: String(
                        getVal([
                          "الورقة التجارية",
                          "Commercial Paper",
                          "شيك",
                          "سند",
                          "رقم الشيك",
                        ]) || "",
                      ),
                      notes: String(
                        getVal(["ملاحظات", "Notes", "البيان", "ملاحظة"]) || "",
                      ),
                    };
                  },
                );

                resolve(mappedData);
              } catch (error) {
                reject(error);
              }
            };
            reader.onerror = reject;
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
            setIsAIConfigured(false);
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
          try {
            if (isAdmin) {
              const q = query(
                collection(db, "installments"),
                where("uid", "==", "public"),
              );
              const snapshot = await getDocs(q);
              const deletePromises = snapshot.docs.map((doc) =>
                deleteDoc(doc.ref),
              );
              await Promise.all(deletePromises);
            }

            const batchPromises = newData.map((item) => {
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
                  uid: isAdmin ? "public" : user.uid,
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
    [user, isAdmin],
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
    return data
      .filter((item) => {
        const matchesSearch =
          item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.unitCode.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesProject =
          filterProject === "الكل" || item.project === filterProject;

        let matchesStatus = true;
        if (filterStatus !== "الكل") {
          const itemStatus = getInstallmentStatus(item);
          matchesStatus =
            INSTALLMENT_STATUS_META[itemStatus].filterLabel === filterStatus;
        }

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

        return matchesSearch && matchesProject && matchesStatus && matchesDate;
      })
      .sort((a, b) => {
        // Sort from oldest to newest (ascending)
        const dateA =
          a.date && a.date !== "-" && a.date !== "0"
            ? new Date(a.date).getTime()
            : 0;
        const dateB =
          b.date && b.date !== "-" && b.date !== "0"
            ? new Date(b.date).getTime()
            : 0;
        return dateA - dateB;
      });
  }, [data, searchTerm, filterProject, filterStatus, startDate, endDate]);

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

  const handleExportExcel = () => {
    if (!isAdmin) {
      alert("عذراً، لا تملك صلاحية التصدير. هذه الميزة متاحة للمسؤول فقط.");
      return;
    }
    const exportData = filteredData.map((item) => ({
      الحالة: INSTALLMENT_STATUS_META[getInstallmentStatus(item)].exportLabel,
      العميل: item.customer,
      المشروع: item.project,
      الوحدة: item.unitCode,
      التاريخ: item.date,
      "صافي القيمة": item.netValue,
      المحصل: item.collected,
      المتبقي: item.remaining,
      "الورقة التجارية": item.commercialPaper || "-",
      ملاحظات: item.notes || "-",
    }));

    const header = [
      ["تقرير تحصيل الأقساط العقارية"],
      [`تاريخ التقرير: ${new Date().toLocaleDateString("ar-EG")}`],
      [], // Empty row
      [
        "العميل",
        "المشروع",
        "الوحدة",
        "التاريخ",
        "صافي القيمة",
        "المحصل",
        "المتبقي",
        "الورقة التجارية",
        "الحالة",
        "ملاحظات",
      ],
    ];

    const dataRows = filteredData.map((item) => [
      item.customer,
      item.project,
      item.unitCode,
      item.date,
      item.netValue,
      item.collected,
      item.remaining,
      item.commercialPaper || "-",
      INSTALLMENT_STATUS_META[getInstallmentStatus(item)].exportLabel,
      item.notes || "-",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([...header, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "التحصيلات");

    // Auto-size columns
    const colWidths = [
      { wch: 30 }, // العميل
      { wch: 20 }, // المشروع
      { wch: 15 }, // الوحدة
      { wch: 15 }, // التاريخ
      { wch: 15 }, // صافي القيمة
      { wch: 15 }, // المحصل
      { wch: 15 }, // المتبقي
      { wch: 20 }, // الورقة التجارية
      { wch: 25 }, // الحالة
      { wch: 30 }, // ملاحظات
    ];
    ws["!cols"] = colWidths;

    XLSX.writeFile(
      wb,
      `تقرير_التحصيل_${new Date().toLocaleDateString("ar-EG")}.xlsx`,
    );
  };

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 dir-rtl print:p-0 print:m-0 print:bg-white"
      dir="rtl"
    >
      {/* Print-only Header */}
      <header className="hidden print:block mb-12 text-center border-b-4 border-slate-800 pb-8">
        <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">
          تقرير تحصيل الأقساط العقارية
        </h1>
        <div className="flex justify-center gap-12 text-lg text-slate-600 font-bold">
          <p>تاريخ التقرير: {new Date().toLocaleDateString("ar-EG")}</p>
          <p>رقم التقرير: {reportNumber}</p>
        </div>
      </header>

      {/* Header (Screen Only) */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            HIG collection report - elshaer
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
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAll}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg shadow-sm hover:bg-rose-700 transition-all active:scale-95 text-sm font-bold"
                title="حذف جميع البيانات الحالية"
              >
                <Trash2 size={18} />
                <span>حذف الكل</span>
              </button>
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
            </div>
          )}
        </div>
      </header>

      {/* Navigation Tabs (Screen Only) */}
      <nav className="mb-8 border-b border-slate-200 print:hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-4">
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
          </div>

          {isAdmin && (
            <div className="relative pb-3" ref={notificationsRef}>
              <button
                onClick={() => setShowNotifications((prev) => !prev)}
                className="relative rounded-xl p-2 transition-colors hover:bg-slate-100"
                title="\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A"
              >
                <Bell size={20} className="text-slate-600" />
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white">
                    {notificationCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    className="absolute left-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                    dir="rtl"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                      <span className="text-sm font-black text-slate-700">
                        {"\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A"}
                      </span>
                      <button onClick={() => setShowNotifications(false)}>
                        <X size={16} className="text-slate-400" />
                      </button>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      {notificationCount === 0 && (
                        <p className="py-8 text-center text-sm text-slate-400">
                          {"\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0642\u0633\u0627\u0637 \u0645\u0633\u062A\u062D\u0642\u0629 \u0642\u0631\u064A\u0628\u0627\u064B"}
                        </p>
                      )}

                      {dueToday.length > 0 && (
                        <div>
                          <div className="border-b border-rose-100 bg-rose-50 px-4 py-2">
                            <span className="text-xs font-black uppercase tracking-wider text-rose-600">
                              {"\u0645\u0633\u062A\u062D\u0642 \u0627\u0644\u064A\u0648\u0645"} ({dueToday.length})
                            </span>
                          </div>
                          {dueToday.map((item) => (
                            <div key={item.id ?? buildInstallmentKey(item)}>
                              <NotificationItem item={item} />
                            </div>
                          ))}
                        </div>
                      )}

                      {dueSoon.length > 0 && (
                        <div>
                          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2">
                            <span className="text-xs font-black uppercase tracking-wider text-amber-600">
                              {"\u0645\u0633\u062A\u062D\u0642 \u062E\u0644\u0627\u0644 7 \u0623\u064A\u0627\u0645"} ({dueSoon.length})
                            </span>
                          </div>
                          {dueSoon.map((item) => (
                            <div key={item.id ?? buildInstallmentKey(item)}>
                              <NotificationItem item={item} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
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
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            filteredData={filteredData}
            totals={totals}
            handleUpdateNote={handleUpdateNote}
            handleUpdateCollected={handleUpdateCollected}
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

      {isAIConfigured && (
        <GeminiChatPanel
          isOpen={isChatOpen}
          onToggle={() => setIsChatOpen((prev) => !prev)}
          messages={chatMessages}
          input={chatInput}
          onInputChange={setChatInput}
          onSend={handleChatSend}
          isLoading={isChatLoading}
          onClear={handleChatClear}
          hasData={data.length > 0}
          chatBottomRef={chatBottomRef}
        />
      )}

      {/* Print-only sections stay mounted off-screen so Recharts can render before print */}
      <div className="print-render-root" aria-hidden="true">
        {/* Print-only First Page (KPIs + Charts) */}
        <div
          className="print:break-after-page"
          style={{ pageBreakAfter: "always" }}
        >
          <div className="mb-4">
            <h2 className="text-xl font-bold mb-4 border-r-8 border-indigo-600 pr-4 py-1 bg-slate-50">
              ملخص التحصيل العام - التقرير الإداري
            </h2>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                <p className="text-[10px] text-slate-500 mb-1 font-bold">
                  إجمالي القيمة الصافية
                </p>
                <p className="text-lg font-black text-slate-900">
                  {formatCurrency(stats.totalNetValue)}
                </p>
              </div>
              <div className="p-3 bg-white border border-emerald-200 rounded-xl shadow-sm">
                <p className="text-[10px] text-emerald-600 mb-1 font-bold">
                  إجمالي المحصل الفعلي
                </p>
                <p className="text-lg font-black text-emerald-700">
                  {formatCurrency(stats.totalCollected)}
                </p>
              </div>
              <div className="p-3 bg-white border border-rose-200 rounded-xl shadow-sm">
                <p className="text-[10px] text-rose-600 mb-1 font-bold">
                  إجمالي المتبقي
                </p>
                <p className="text-lg font-black text-rose-700">
                  {formatCurrency(stats.totalRemaining)}
                </p>
              </div>
              <div className="p-3 bg-white border border-indigo-200 rounded-xl shadow-sm">
                <p className="text-[10px] text-indigo-600 mb-1 font-bold">
                  نسبة التحصيل
                </p>
                <p className="text-lg font-black text-indigo-700">
                  {stats.collectionRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <h2 className="text-lg font-bold mb-4 border-r-4 border-indigo-600 pr-3">
            التحليل البياني والتدفقات
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 print:break-inside-avoid shadow-sm">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <PieChartIcon size={16} className="text-indigo-600" />
                توزيع التحصيل حسب المشروع
              </h3>
              <div className="h-[280px] w-full flex justify-center items-center">
                {stats.projectStats.length > 0 ? (
                  <PieChart width={350} height={280}>
                    <Pie
                      data={stats.projectStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="collected"
                      nameKey="name"
                      label={({ name, percent }: any) =>
                        `${name} (${(percent * 100).toFixed(0)}%)`
                      }
                      labelLine={false}
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
                    <Legend iconSize={10} wrapperStyle={{ fontSize: "10px" }} />
                  </PieChart>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400">
                    لا توجد بيانات للمشاريع
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 print:break-inside-avoid shadow-sm">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-600" />
                التدفق المالي الشهري
              </h3>
              <div className="h-[280px] w-full flex justify-center items-center">
                {stats.monthlyStats.length > 0 ? (
                  <AreaChart
                    width={350}
                    height={280}
                    data={stats.monthlyStats}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#f1f5f9"
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10, fontWeight: 700 }}
                    />
                    <YAxis
                      tickFormatter={(v) =>
                        v >= 1000000
                          ? `${(v / 1000000).toFixed(1)}M`
                          : v >= 1000
                            ? `${(v / 1000).toFixed(0)}K`
                            : v
                      }
                      tick={{ fontSize: 8 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="collected"
                      name="المحصل"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="remaining"
                      name="المتبقي"
                      stroke="#f43f5e"
                      fill="#f43f5e"
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                    <Legend
                      verticalAlign="top"
                      height={20}
                      iconSize={10}
                      wrapperStyle={{ fontSize: "10px" }}
                    />
                  </AreaChart>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400">
                    لا توجد بيانات شهرية
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Table Section (Starts on New Page) */}
        <div className="print:mt-4">
          <h2 className="text-xl font-bold mb-4 border-r-8 border-indigo-600 pr-4 py-1 bg-slate-50">
            تفاصيل البيانات والتحصيلات
          </h2>

          {/* Print Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50 text-slate-900 border-b-2 border-slate-300 text-xs">
                  <th className="px-3 py-3 font-black border text-right">
                    العميل
                  </th>
                  <th className="px-3 py-3 font-black border text-right">
                    المشروع
                  </th>
                  <th className="px-3 py-3 font-black border text-right max-w-[120px]">
                    الوحدة
                  </th>
                  <th className="px-3 py-3 font-black border text-right">
                    التاريخ
                  </th>
                  <th className="px-3 py-3 font-black border text-right">
                    صافي القيمة
                  </th>
                  <th className="px-3 py-3 font-black border text-center">
                    المحصل
                  </th>
                  <th className="px-3 py-3 font-black border text-center">
                    المتبقي
                  </th>
                  <th className="px-3 py-3 font-black border text-right">
                    الملاحظات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredData.map((item, idx) => (
                  <tr key={idx} className="border-b text-xs">
                    <td className="px-3 py-2 border font-bold">
                      {item.customer}
                    </td>
                    <td className="px-3 py-2 border">{item.project}</td>
                    <td className="px-3 py-2 border font-mono max-w-[120px] whitespace-normal break-words">
                      {item.unitCode}
                    </td>
                    <td className="px-3 py-2 border">
                      {formatDate(item.date)}
                    </td>
                    <td className="px-3 py-2 border font-black">
                      {formatCurrency(item.netValue)}
                    </td>
                    <td className="px-3 py-2 border text-center font-black text-emerald-700">
                      {formatCurrency(item.collected)}
                    </td>
                    <td className="px-3 py-2 border text-center font-black text-rose-700">
                      {formatCurrency(item.remaining)}
                    </td>
                    <td className="px-3 py-2 border text-[10px]">
                      {item.notes || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold">
                <tr>
                  <td colSpan={4} className="px-4 py-3 border">
                    الإجمالي
                  </td>
                  <td className="px-4 py-3 border">
                    {formatCurrency(totals.netValue)}
                  </td>
                  <td className="px-4 py-3 border text-center">
                    {formatCurrency(totals.collected)}
                  </td>
                  <td className="px-4 py-3 border text-center">
                    {formatCurrency(totals.remaining)}
                  </td>
                  <td className="px-4 py-3 border"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer / Summary for Print */}
          <footer className="mt-16 pt-12 border-t-4 border-slate-900 text-center text-slate-600 text-sm">
            <div className="grid grid-cols-3 gap-12 mb-16">
              <div className="text-center">
                <p className="font-black text-slate-900 text-lg mb-16">
                  إعداد المحاسب
                </p>
                <div className="w-48 h-0.5 bg-slate-900 mx-auto"></div>
                <p className="mt-4 text-slate-400">التوقيع</p>
              </div>
              <div className="text-center">
                <p className="font-black text-slate-900 text-lg mb-16">
                  المراجعة المالية
                </p>
                <div className="w-48 h-0.5 bg-slate-900 mx-auto"></div>
                <p className="mt-4 text-slate-400">التوقيع</p>
              </div>
              <div className="text-center">
                <p className="font-black text-slate-900 text-lg mb-16">
                  اعتماد المدير العام
                </p>
                <div className="w-48 h-0.5 bg-slate-900 mx-auto"></div>
                <p className="mt-4 text-slate-400">التوقيع</p>
              </div>
            </div>
            <div className="flex justify-between items-center text-xs text-slate-500 border-t border-slate-200 pt-6">
              <p>تاريخ الاستخراج: {new Date().toLocaleString("ar-EG")}</p>
              <p>نظام تحصيل الأقساط العقارية الذكي - تقرير إداري معتمد</p>
              <p>يتم تحديد عدد الصفحات عند الطباعة</p>
            </div>
          </footer>
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
  filterStatus,
  setFilterStatus,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  filteredData,
  totals,
  handleUpdateNote,
  handleUpdateCollected,
  handleUpdatePhone,
  selectedRows,
  setSelectedRows,
}: DashboardViewProps) {
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
    (item: InstallmentData) => buildInstallmentKey(item),
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
      selectedRows.has(buildInstallmentKey(item)),
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
            icon={<DollarSign size={24} />}
            subtitle="المستحق"
            color="indigo"
          />
          <KpiCard
            title="إجمالي المحصل الفعلي"
            value={formatCurrency(stats.totalCollected)}
            icon={<CheckCircle2 size={24} />}
            subtitle={`${stats.collectionRate.toFixed(1)}% معدل التحصيل`}
            color="emerald"
          />
          <KpiCard
            title="إجمالي المتبقي"
            value={formatCurrency(stats.totalRemaining)}
            icon={<AlertCircle size={24} />}
            subtitle="متأخرات"
            color="rose"
          />
          <KpiCard
            title="عدد العملاء"
            value={data.length.toString()}
            icon={<Users size={24} />}
            subtitle="نشط"
            color="amber"
          />
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Project Distribution Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800">
            <PieChartIcon size={20} className="text-indigo-600" />
            توزيع التحصيل حسب المشروع
          </h3>
          <div className="flex flex-col xl:flex-row items-center gap-8">
            <div className="h-[280px] w-full xl:w-1/2">
              {stats.projectStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.projectStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={8}
                      dataKey="collected"
                      nameKey="name"
                      stroke="none"
                    >
                      {stats.projectStats.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={["#6366f1", "#10b981", "#f43f5e", "#f59e0b", "#8b5cf6"][index % 5]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: "1rem", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", textAlign: "right", direction: "rtl" }}
                      formatter={(value: number) => [formatCurrency(value), "المحصل"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 font-medium">لا توجد بيانات للمشاريع</div>
              )}
            </div>
            {/* Detailed Side Legend */}
            <div className="w-full xl:w-1/2 space-y-3 max-h-[280px] overflow-y-auto">
              {stats.projectStats.map((p, index) => {
                const percent = ((p.collected / stats.totalCollected) * 100) || 0;
                return (
                  <div key={p.name} className="flex flex-col gap-1 p-2 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ["#6366f1", "#10b981", "#f43f5e", "#f59e0b", "#8b5cf6"][index % 5] }} />
                        <span className="text-xs font-black text-slate-700">{p.name}</span>
                      </div>
                      <span className="text-[10px] font-black py-0.5 px-2 bg-slate-100 text-slate-600 rounded-full">%{percent.toFixed(1)}</span>
                    </div>
                    <div className="text-[11px] font-bold text-slate-400 mr-5">{formatCurrency(p.collected)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Financial Trend Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800">
            <TrendingUp size={20} className="text-emerald-600" />
            الاتجاه المالي للتحصيلات
          </h3>
          <div className="h-[280px]">
            {stats.monthlyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.monthlyStats} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: "bold" }} axisLine={false} tickLine={false} />
                  <YAxis 
                    tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                    tick={{ fontSize: 10, fontWeight: "bold" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: "1rem", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", textAlign: "right", direction: "rtl" }}
                    formatter={(value: number) => [formatCurrency(value), "المحصل"]}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="collected" 
                    stroke="#10b981" 
                    strokeWidth={4} 
                    fillOpacity={1} 
                    fill="url(#colorTrend)"
                  >
                    <LabelList 
                      dataKey="collected" 
                      position="top" 
                      offset={10} 
                      formatter={(v: number) => v > 0 ? (v >= 1000 ? `${(v/1000).toFixed(0)}K` : v) : ''}
                      className="text-[9px] font-black fill-slate-400"
                    />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 font-medium">لا توجد بيانات زمنية</div>
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
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="الكل">كل الحالات</option>
              <option value="مسدد">مسدد</option>
              <option value="جزئي">جزئي</option>
              <option value="متأخر">متأخر</option>
              <option value="ورقة مالية">ورقة مالية</option>
            </select>
            <select
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
            >
              <option value="الكل">كل المشاريع</option>
                {Array.from(new Set(data.map((item) => item.project))).map(
                  (p) => (
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
                {filteredData.map((item) => {
                  const rowKey = buildInstallmentKey(item);
                  const isSelected = selectedRows.has(rowKey);
                  const statusMeta =
                    INSTALLMENT_STATUS_META[getInstallmentStatus(item)];
                  return (
                    <motion.tr
                      key={rowKey}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
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
                        {isAdmin ? (
                          <input
                            type="number"
                            key={item.id ?? rowKey}
                            defaultValue={item.collected}
                            min={0}
                            max={item.netValue}
                            onBlur={(e) => {
                              const value = Number(e.target.value);
                              if (value !== item.collected) {
                                handleUpdateCollected(
                                  item.customer,
                                  item.installmentCode,
                                  value,
                                );
                              }
                            }}
                            className="w-28 border-b border-transparent bg-transparent py-1 text-center font-black text-emerald-600 transition-all group-hover:border-emerald-200 focus:border-emerald-500 focus:outline-none"
                          />
                        ) : (
                          formatCurrency(item.collected)
                        )}
                      </td>
                      <td className="px-6 py-4 text-rose-600 font-black text-center">
                        {formatCurrency(item.remaining)}
                      </td>
                      <td className="px-6 py-4 text-indigo-600 font-mono text-xs tracking-tighter">
                        {item.commercialPaper || "-"}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={cn(
                            "inline-flex px-2.5 py-1",
                            statusMeta.badgeClassName,
                          )}
                        >
                          {statusMeta.badgeLabel}
                        </span>
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
}: ReportsViewProps) {
  return (
    <div className="space-y-8 pb-12">
      {/* Reports Header */}
      <div className="card-ledger p-6 md:p-8 bg-white/80 backdrop-blur-md flex flex-col md:flex-row justify-between items-center gap-6 border-b-4 border-indigo-500/20">
        <div className="text-center md:text-right">
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3 justify-center md:justify-start">
            <span className="w-2 h-8 bg-indigo-600 rounded-full hidden md:block" />
            مركز التقارير والتحليل المالي
          </h2>
          <p className="text-slate-500 font-medium mt-2">نظرة شاملة على أداء التحصيلات وتدفقات السيولة النقدية</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-3 px-6 py-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl font-black hover:bg-emerald-600 hover:text-white transition-all active:scale-95 shadow-sm"
            >
              <FileSpreadsheet size={20} />
              تصدير Excel
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-3 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200"
            >
              <Printer size={20} />
              طباعة (PDF)
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard
          title="إجمالي القيمة التعاقدية"
          value={formatCurrency(stats.totalNetValue)}
          icon={<DollarSign size={20} />}
          color="indigo"
          subtitle="كامل قيمة الأقساط"
        />
        <KpiCard
          title="إجمالي التحصيلات"
          value={formatCurrency(stats.totalCollected)}
          icon={<CheckCircle2 size={20} />}
          color="emerald"
          subtitle={`${stats.collectionRate.toFixed(1)}% معدل التحصيل`}
        />
        <KpiCard
          title="الرصيد المتبقي"
          value={formatCurrency(stats.totalRemaining)}
          icon={<AlertCircle size={20} />}
          color="rose"
          subtitle="تحصيلات قيد الانتظار"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-ledger p-6 bg-white">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black text-slate-900 border-r-4 border-indigo-500 pr-3">توزيع أداء المشاريع</h3>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <PieChartIcon size={20} />
            </div>
          </div>
          <div className="flex flex-col xl:flex-row items-center gap-8">
            <div className="h-[320px] w-full xl:w-1/2">
              {stats.projectStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.projectStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      paddingAngle={8}
                      dataKey="collected"
                      nameKey="name"
                      stroke="none"
                    >
                      {stats.projectStats.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={["#6366f1", "#10b981", "#f43f5e", "#f59e0b", "#8b5cf6"][index % 5]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: "1.5rem", border: "none", boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)", textAlign: "right", direction: "rtl" }}
                      formatter={(value: number) => [formatCurrency(value), "المحصل"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <NoDataPlaceholder icon={<PieChartIcon size={48} />} text="لا توجد بيانات للمشاريع" />
              )}
            </div>
            {/* Reports Legend */}
            <div className="w-full xl:w-1/2 space-y-4 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
              {stats.projectStats.map((p, index) => {
                const percent = ((p.collected / stats.totalCollected) * 100) || 0;
                return (
                  <div key={p.name} className="flex flex-col gap-1.5 p-3 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-indigo-200 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: ["#6366f1", "#10b981", "#f43f5e", "#f59e0b", "#8b5cf6"][index % 5] }} />
                        <span className="text-sm font-black text-slate-800">{p.name}</span>
                      </div>
                      <span className="text-[11px] font-black py-1 px-3 bg-white text-indigo-600 rounded-full border border-indigo-100 shadow-sm">%{percent.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center mr-7">
                      <span className="text-xs font-bold text-slate-400">صافي المحصل:</span>
                      <span className="text-sm font-black text-slate-700">{formatCurrency(p.collected)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card-ledger p-6 bg-white">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black text-slate-900 border-r-4 border-emerald-500 pr-3">تحليل الاتجاه المالي</h3>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="h-[350px]">
            {stats.monthlyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.monthlyStats} margin={{ top: 30, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReport" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: "black" }} axisLine={false} tickLine={false} />
                  <YAxis 
                    tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                    tick={{ fontSize: 10, fontWeight: "bold" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: "1.5rem", border: "none", boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)", textAlign: "right", direction: "rtl" }}
                    formatter={(value: number) => [formatCurrency(value), "المحصل"]}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="collected" 
                    stroke="#10b981" 
                    strokeWidth={5} 
                    fillOpacity={1} 
                    fill="url(#colorReport)"
                    animationDuration={1500}
                  >
                    <LabelList 
                      dataKey="collected" 
                      position="top" 
                      offset={15} 
                      formatter={(v: number) => v > 0 ? (v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v) : ''}
                      className="text-[10px] font-black fill-slate-500"
                    />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <NoDataPlaceholder icon={<TrendingUp size={48} />} text="لا توجد بيانات زمنية" />
            )}
          </div>
        </div>
      </div>

      {/* Analytical Table */}
      <div className="card-ledger bg-white overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-900">مقارنة أداء المشاريع</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] font-black uppercase border-b border-slate-100">
                <th className="px-8 py-5">المشروع</th>
                <th className="px-8 py-5">المستحق</th>
                <th className="px-8 py-5">المحصل</th>
                <th className="px-8 py-5">المتبقي</th>
                <th className="px-8 py-5 text-center">الإنجاز</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.projectStats.map((p) => {
                const rate = getCollectionRate(p.collected, p.total);
                return (
                  <tr key={p.name} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5 font-black text-slate-800">{p.name}</td>
                    <td className="px-8 py-5 font-bold">{formatCurrency(p.total)}</td>
                    <td className="px-8 py-5 font-black text-emerald-600">{formatCurrency(p.collected)}</td>
                    <td className="px-8 py-5 font-black text-rose-500">{formatCurrency(p.remaining)}</td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4 justify-center">
                        <div className="w-32 h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-1000",
                              rate > 80 ? "bg-emerald-500 " : rate > 50 ? "bg-indigo-500" : "bg-rose-500"
                            )}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className="text-xs font-black text-slate-700">%{rate.toFixed(0)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NoDataPlaceholder({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
      <div className="opacity-20">{icon}</div>
      <span className="text-sm font-bold opacity-50">{text}</span>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  trend,
  color,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: { value: number; isUp: boolean };
  color: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="card-ledger p-6 hover:translate-y-[-4px] transition-all duration-300 group"
    >
      <div className="flex items-center justify-between mb-6">
        <div
          className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110 shadow-lg",
            color === "indigo" ? "bg-indigo-600 text-white shadow-indigo-200" :
            color === "emerald" ? "bg-emerald-500 text-white shadow-emerald-200" :
            color === "rose" ? "bg-rose-500 text-white shadow-rose-200" :
            color === "amber" ? "bg-amber-500 text-white shadow-amber-200" :
            "bg-slate-900 text-white shadow-slate-200"
          )}
        >
          {icon}
        </div>
        {trend && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full border shadow-sm",
              trend.isUp ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
            )}
          >
            {trend.isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>%{Math.abs(trend.value).toFixed(1)}</span>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-slate-400 text-xs font-black mb-2 uppercase tracking-widest">{title}</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-slate-900 tracking-tight">{value}</span>
        </div>
        {subtitle && (
          <p className="text-[10px] text-slate-400 font-bold mt-2 flex items-center gap-1 opacity-70">
            <span className="w-1 h-1 bg-current rounded-full" />
            {subtitle}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function NotificationItem({ item }: { item: InstallmentData }) {
  return (
    <div className="border-b border-slate-50 px-4 py-3 transition-colors hover:bg-slate-50">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-slate-800">{item.customer}</span>
        <span className="text-xs text-slate-400">{item.date}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs text-slate-500">{item.project}</span>
        <span className="text-xs text-slate-300">{"\u00B7"}</span>
        <span className="text-xs font-bold text-rose-600">
          {"\u0645\u062A\u0628\u0642\u064A:"} {formatCurrency(item.remaining)}
        </span>
      </div>
    </div>
  );
}

function GeminiChatPanel({
  isOpen,
  onToggle,
  messages,
  input,
  onInputChange,
  onSend,
  isLoading,
  onClear,
  hasData,
  chatBottomRef,
}: {
  isOpen: boolean;
  onToggle: () => void;
  messages: ChatMessage[];
  input: string;
  onInputChange: (val: string) => void;
  onSend: () => void;
  isLoading: boolean;
  onClear: () => void;
  hasData: boolean;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {/* Floating Trigger */}
      <button
        onClick={onToggle}
        className={cn(
          "fixed bottom-6 left-6 z-[51] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-90 print:hidden",
          isOpen ? "bg-slate-800 text-white rotate-90" : "bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-110"
        )}
      >
        {isOpen ? <X size={24} /> : <Bot size={28} />}
      </button>

      {/* Chat Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95, x: -20 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
            exit={{ opacity: 0, y: 20, scale: 0.95, x: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-24 left-6 z-50 w-96 max-h-[70vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden print:hidden"
          >
            {/* Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                  <Bot size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 leading-none">مساعد البيانات الذكي</h4>
                  <span className="text-[10px] text-emerald-500 font-bold">بواسطة Gemini 2.0 Flash</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={onClear}
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                  title="مسح المحادثة"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={onToggle}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] bg-slate-50/30 custom-scrollbar">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-400">
                    <Bot size={32} />
                  </div>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">كيف يمكنني مساعدتك اليوم؟</p>
                  <p className="text-xs text-slate-400 leading-relaxed italic">يمكنك سؤالي عن إجمالي الأقساط، العملاء المتأخرين، أو توزيع المشاريع.</p>
                </div>
              )}
              
              {messages.map((msg, i) => (
                <div
                  key={msg.timestamp + i}
                  className={cn(
                    "flex w-full",
                    msg.role === "user" ? "justify-start" : "justify-end"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                      msg.role === "user"
                        ? "bg-indigo-600 text-white rounded-tr-none font-medium"
                        : "bg-white text-slate-800 border border-slate-100 rounded-tl-none font-bold"
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-end">
                  <div className="bg-white border border-slate-100 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-1 shadow-sm">
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" />
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-slate-100">
              {!hasData && (
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2 text-amber-700">
                  <AlertCircle size={14} />
                  <span className="text-[10px] font-bold">لا توجد بيانات حالياً للإجابة على استفساراتك.</span>
                </div>
              )}
              <div className="relative flex items-center gap-2">
                <input
                  type="text"
                  placeholder={hasData ? "اسألني أي شيء عن البيانات..." : "برجاء تحميل بيانات أولاً"}
                  disabled={!hasData || isLoading}
                  value={input}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSend()}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 transition-all font-bold placeholder:font-medium"
                />
                <button
                  onClick={onSend}
                  disabled={!input.trim() || isLoading || !hasData}
                  className="w-11 h-11 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all active:scale-95 shadow-lg shadow-indigo-100"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
