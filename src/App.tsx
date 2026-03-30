/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  AreaChart, Area, LabelList
} from 'recharts';
import { 
  Upload, TrendingUp, DollarSign, Users, AlertCircle, 
  Download, Printer, Search, CheckCircle2, Loader2
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { InstallmentData, DashboardStats } from './types';
import { analyzeCollectionPDF, isAIConfigured } from './services/geminiService';

// Sample data for initial view - Matching PDF exactly
const SAMPLE_DATA: InstallmentData[] = [
  { customer: "محمد عيد ابو زيد محارب", project: "IL Parco", unitCode: "IL Parco-G2", type: "الدفعة المقدمة", installmentCode: "2024020113", date: "2025-02-17", value: 1300000, netValue: 1300000, collected: 1299600, remaining: 400, commercialPaper: "", notes: "" },
  { customer: "ربيع عبد الرحمن عبد العال محمد", project: "IL Parco", unitCode: "IL Parco-G-11", type: "قسط", installmentCode: "2025032402", date: "2025-06-24", value: 245193, netValue: 245193, collected: 245000, remaining: 193, commercialPaper: "", notes: "" },
  { customer: "احمد محمد خليفة محمد", project: "IL Centro", unitCode: "IL Centro-F22", type: "قسط", installmentCode: "2025093003", date: "2025-07-01", value: 264927, netValue: 264927, collected: 209003, remaining: 55924, commercialPaper: "", notes: "" },
  { customer: "محمد عبدالجيد غمرى شعراوى", project: "Caza", unitCode: "Caza-G28", type: "قسط", installmentCode: "2025121302", date: "2026-03-15", value: 156070, netValue: 156070, collected: 156070, remaining: 156070, commercialPaper: "60317000023576", notes: "" },
];

export default function App() {
  const [data, setData] = useState<InstallmentData[]>(SAMPLE_DATA);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAiError, setShowAiError] = useState(!isAIConfigured());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProject, setFilterProject] = useState("الكل");

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

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

      const base64 = fileData.split(',')[1];
      const result = await analyzeCollectionPDF(base64);
      
      if (result && result.length > 0) {
        setData(result);
      } else {
        alert("لم يتم العثور على بيانات في الملف أو حدث خطأ أثناء التحليل.");
      }
    } catch (error: any) {
      console.error("Error analyzing PDF:", error);
      if (error.message === "MISSING_API_KEY") {
        alert("تنبيه: مفتاح GEMINI_API_KEY غير متوفر. يرجى إضافته من قائمة الإعدادات (Settings) لتفعيل ميزة تحليل الملفات بالذكاء الاصطناعي.");
        setShowAiError(true);
      } else {
        alert("حدث خطأ أثناء رفع أو تحليل الملف. يرجى المحاولة مرة أخرى.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  } as any);

  const stats = useMemo((): DashboardStats => {
    const totalNet = data.reduce((sum, item) => sum + item.netValue, 0);
    
    // Logic Audit: 
    // 1. If there's a commercial paper, it's NOT considered collected cash yet (per user request).
    // 2. We only count collected cash if there's no pending commercial paper.
    const totalCollected = data.reduce((sum, item) => {
      if (item.commercialPaper && item.commercialPaper.trim() !== "") return sum;
      return sum + item.collected;
    }, 0);
    
    const totalRemaining = data.reduce((sum, item) => sum + item.remaining, 0);
    
    const projects = Array.from(new Set(data.map(item => item.project)));
    const projectStats = projects.map(p => {
      const pData = data.filter(item => item.project === p);
      return {
        name: String(p),
        collected: pData.reduce((sum, item) => {
          if (item.commercialPaper && item.commercialPaper.trim() !== "") return sum;
          return sum + item.collected;
        }, 0),
        remaining: pData.reduce((sum, item) => sum + item.remaining, 0),
      };
    });

    const months = Array.from(new Set(data.map(item => item.date.substring(0, 7)))).sort();
    const monthlyStats = months.map(m => {
      const mData = data.filter(item => item.date.startsWith(m));
      return {
        month: String(m),
        collected: mData.reduce((sum, item) => {
          if (item.commercialPaper && item.commercialPaper.trim() !== "") return sum;
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
      monthlyStats
    };
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = item.customer.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            item.unitCode.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProject = filterProject === "الكل" || item.project === filterProject;
      return matchesSearch && matchesProject;
    });
  }, [data, searchTerm, filterProject]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(val);
  };

  const totals = useMemo(() => {
    return filteredData.reduce((acc, item) => ({
      collected: acc.collected + item.collected,
      remaining: acc.remaining + item.remaining,
      netValue: acc.netValue + item.netValue
    }), { collected: 0, remaining: 0, netValue: 0 });
  }, [filteredData]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 dir-rtl print:p-0 print:m-0 print:bg-white" dir="rtl">
      {/* Print Header */}
      <div className="hidden print:flex flex-col items-center mb-6 border-b-2 border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">تقرير تحصيل الأقساط العقارية</h1>
        <p className="text-slate-600 mt-1">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
      </div>

      {/* Header (Screen Only) */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">لوحة تحكم التحصيل العقاري</h1>
          <p className="text-slate-500">تحليل احترافي لبيانات العملاء والأقساط المستحقة</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {showAiError && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs animate-pulse">
              <AlertCircle size={16} />
              <span>مفتاح AI غير مفعل. يرجى ضبطه من الإعدادات.</span>
            </div>
          )}
          <button 
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 hover:border-indigo-300 transition-all active:scale-95 group cursor-pointer"
          >
            <Printer size={20} className="text-indigo-600 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-slate-700">طباعة التقرير</span>
          </button>
          <div {...getRootProps()} className={cn(
            "flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl shadow-md cursor-pointer hover:bg-indigo-700 transition-all active:scale-95",
            isDragActive && "bg-indigo-800 scale-105"
          )}>
            <input {...getInputProps()} />
            {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
            <span className="font-bold">{isAnalyzing ? "جاري التحليل..." : "رفع ملف PDF"}</span>
          </div>
        </div>
      </header>

      {/* Print Summary Section */}
      <div className="hidden print:block mb-8">
        <h2 className="text-lg font-bold mb-4 border-b border-slate-300 pb-2">ملخص التحصيل</h2>
        <div className="print-summary-grid">
          <div className="border border-slate-200 p-3 rounded">
            <p className="text-xs text-slate-500 mb-1">إجمالي القيمة الصافية</p>
            <p className="font-bold text-slate-900">{formatCurrency(stats.totalNetValue)}</p>
          </div>
          <div className="border border-slate-200 p-3 rounded">
            <p className="text-xs text-slate-500 mb-1">إجمالي المحصل الفعلي</p>
            <p className="font-bold text-emerald-600">{formatCurrency(stats.totalCollected)}</p>
          </div>
          <div className="border border-slate-200 p-3 rounded">
            <p className="text-xs text-slate-500 mb-1">إجمالي المتبقي</p>
            <p className="font-bold text-rose-600">{formatCurrency(stats.totalRemaining)}</p>
          </div>
          <div className="border border-slate-200 p-3 rounded">
            <p className="text-xs text-slate-500 mb-1">نسبة التحصيل</p>
            <p className="font-bold text-indigo-600">{stats.collectionRate.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* KPI Cards (Screen Only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 print:hidden">
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

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 print:break-inside-avoid print:grid-cols-1">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 print:shadow-none print:border-slate-300">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-600" />
            توزيع التحصيل حسب المشروع
          </h3>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={stats.projectStats} 
                layout="vertical" 
                margin={{ top: 5, right: 120, left: 20, bottom: 5 }}
                barGap={8}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide padding={{ right: 100 }} />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={150} 
                  tick={{ fontSize: 12, fontWeight: 700, fill: '#1e293b', textAnchor: 'end', dx: -10 }} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', textAlign: 'right' }}
                  formatter={(value: number) => formatCurrency(value)} 
                />
                <Legend verticalAlign="top" align="right" iconType="circle" height={36} />
                <Bar dataKey="collected" name="المحصل الفعلي" fill="#10b981" radius={[0, 6, 6, 0]} barSize={24}>
                  <LabelList 
                    dataKey="collected" 
                    position="right" 
                    offset={12}
                    formatter={(v: number) => v > 0 ? formatCurrency(v) : ''} 
                    style={{ fontSize: '11px', fontWeight: '800', fill: '#065f46' }} 
                  />
                </Bar>
                <Bar dataKey="remaining" name="المتبقي" fill="#f43f5e" radius={[0, 6, 6, 0]} barSize={24}>
                  <LabelList 
                    dataKey="remaining" 
                    position="right" 
                    offset={12}
                    formatter={(v: number) => v > 0 ? formatCurrency(v) : ''} 
                    style={{ fontSize: '11px', fontWeight: '800', fill: '#9f1239' }} 
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 print:shadow-none print:border-slate-300">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-600" />
            التدفق المالي الشهري
          </h3>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.monthlyStats} margin={{ top: 50, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => formatCurrency(value)} 
                />
                <Legend verticalAlign="top" align="right" iconType="circle" height={36} />
                <Area 
                  type="monotone" 
                  dataKey="collected" 
                  name="المحصل الفعلي" 
                  stroke="#10b981" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorCollected)" 
                >
                  <LabelList 
                    dataKey="collected" 
                    position="top" 
                    offset={10}
                    formatter={(v: number) => v > 100000 ? formatCurrency(v) : ''} 
                    style={{ fontSize: '10px', fontWeight: '700', fill: '#059669' }} 
                  />
                </Area>
                <Area 
                  type="monotone" 
                  dataKey="remaining" 
                  name="المتبقي" 
                  stroke="#f43f5e" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="transparent" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden print:shadow-none print:border-slate-300">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
          <h3 className="text-lg font-semibold">تفاصيل العملاء والأقساط</h3>
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
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
              {Array.from(new Set(data.map(item => item.project))).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">العميل</th>
                <th className="px-6 py-4 font-semibold">المشروع</th>
                <th className="px-6 py-4 font-semibold">الوحدة</th>
                <th className="px-6 py-4 font-semibold">كود القسط</th>
                <th className="px-6 py-4 font-semibold">التاريخ</th>
                <th className="px-6 py-4 font-semibold">المحصل</th>
                <th className="px-6 py-4 font-semibold">المتبقي</th>
                <th className="px-6 py-4 font-semibold">الورقة التجارية</th>
                <th className="px-6 py-4 font-semibold">الحالة</th>
                <th className="px-6 py-4 font-semibold">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence>
                {filteredData.map((item, idx) => (
                  <motion.tr 
                    key={`${item.customer}-${idx}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-slate-800">{item.customer}</td>
                    <td className="px-6 py-4 text-slate-600">{item.project}</td>
                    <td className="px-6 py-4 text-slate-600">{item.unitCode}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{item.installmentCode}</td>
                    <td className="px-6 py-4 text-slate-600">{item.date}</td>
                    <td className="px-6 py-4 text-emerald-600 font-semibold">{formatCurrency(item.collected)}</td>
                    <td className="px-6 py-4 text-rose-600 font-semibold">{formatCurrency(item.remaining)}</td>
                    <td className="px-6 py-4 text-indigo-600 font-bold text-xs">{item.commercialPaper || "-"}</td>
                    <td className="px-6 py-4">
                      {item.commercialPaper && item.commercialPaper.trim() !== "" ? (
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium">بانتظار التحصيل (ورقة)</span>
                      ) : item.remaining <= 0 ? (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">مسدد بالكامل</span>
                      ) : item.collected > 0 ? (
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">مسدد جزئياً</span>
                      ) : (
                        <span className="px-2 py-1 bg-rose-100 text-rose-700 text-xs rounded-full font-medium">غير مسدد</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm">{item.notes || "-"}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
            <tfoot className="bg-slate-50/50 font-bold border-t-2 border-slate-200">
              <tr>
                <td colSpan={5} className="px-6 py-4 text-slate-700">الإجمالي للمجموعة الحالية</td>
                <td className="px-6 py-4 text-emerald-700">{formatCurrency(totals.collected)}</td>
                <td className="px-6 py-4 text-rose-700">{formatCurrency(totals.remaining)}</td>
                <td colSpan={3} className="px-6 py-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Footer / Summary for Print */}
      <footer className="mt-12 pt-8 border-t-2 border-slate-800 text-center text-slate-600 text-sm hidden print:block">
        <div className="grid grid-cols-3 gap-8 mb-12">
          <div className="text-center">
            <p className="font-bold text-slate-800 mb-12">إعداد المحاسب</p>
            <div className="w-40 h-px bg-slate-400 mx-auto"></div>
          </div>
          <div className="text-center">
            <p className="font-bold text-slate-800 mb-12">المراجعة المالية</p>
            <div className="w-40 h-px bg-slate-400 mx-auto"></div>
          </div>
          <div className="text-center">
            <p className="font-bold text-slate-800 mb-12">اعتماد المدير العام</p>
            <div className="w-40 h-px bg-slate-400 mx-auto"></div>
          </div>
        </div>
        <div className="flex justify-between items-center text-xs text-slate-400 border-t border-slate-100 pt-4">
          <p>تاريخ الاستخراج: {new Date().toLocaleString('ar-EG')}</p>
          <p>صفحة 1 من 1</p>
          <p>نظام تحصيل الأقساط العقارية الذكي</p>
        </div>
      </footer>
    </div>
  );
}

function KpiCard({ title, value, icon, trend, color }: { title: string, value: string, icon: React.ReactNode, trend: string, color: string }) {
  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-50 border-indigo-100",
    emerald: "bg-emerald-50 border-emerald-100",
    rose: "bg-rose-50 border-rose-100",
    amber: "bg-amber-50 border-amber-100",
  };

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4"
    >
      <div className="flex justify-between items-start">
        <div className={cn("p-3 rounded-xl border", colorMap[color])}>
          {icon}
        </div>
        <span className={cn(
          "text-xs font-bold px-2 py-1 rounded-full",
          color === 'emerald' ? "bg-emerald-100 text-emerald-700" : 
          color === 'rose' ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
        )}>
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
