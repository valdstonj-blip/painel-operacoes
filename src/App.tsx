import React, { useState, useMemo, useRef } from "react";
import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area
} from "recharts";
import {
  Search,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronRight,
  X,
  Upload,
  Calendar,
  RotateCcw,
  Bell,
  TrendingUp,
  FileText
} from "lucide-react";
import { rawData } from "./data";
import { Operation, DashboardStats } from "./types";

const COLORS = [
  "#1e293b", // Dark Blue
  "#ea580c", // Orange
  "#16a34a", // Green
  "#0ea5e9", // Sky Blue
  "#eab308", // Yellow
  "#9333ea", // Purple
  "#dc2626", // Red
  "#2563eb", // Blue
  "#4f46e5", // Indigo
  "#f97316", // Orange-light
  "#06b6d4", // Cyan
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#10b981", // Emerald
  "#f43f5e", // Rose
];

const STATUS_COLORS: Record<string, string> = {
  "Finalizado": "#1e293b",
  "Em andamento": "#ea580c",
  "Cancelado": "#dc2626",
  "Pendente": "#eab308"
};

// Helper to parse DD/MM/YYYY to timestamp (local time)
const parseDateToTimestamp = (dateStr: string) => {
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day).getTime();
};

// Helper to normalize IDs for consistent matching
const normalizeId = (id: string) => id.trim().toUpperCase().replace(/\s+/g, '');

export default function App() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUope, setFilterUope] = useState("");
  const [filterId, setFilterId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFinalReport, setFilterFinalReport] = useState("");
  const [filterCircumstance, setFilterCircumstance] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const clearFilters = () => {
    setSearchTerm("");
    setFilterUope("");
    setFilterId("");
    setFilterStatus("");
    setFilterFinalReport("");
    setFilterCircumstance("");
    setStartDate("");
    setEndDate("");
  };

  const filteredData = useMemo(() => {
    return operations.filter((op) => {
      const opTime = parseDateToTimestamp(op.date);
      
      const matchesSearch =
        op.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        op.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesUope = !filterUope || op.uope === filterUope;
      const matchesId = !filterId || op.id.toLowerCase().includes(filterId.toLowerCase());
      const matchesStatus = !filterStatus || op.status === filterStatus;
      const matchesFinalReport = !filterFinalReport || op.finalReport === filterFinalReport;
      const matchesCircumstance = !filterCircumstance || op.circumstance === filterCircumstance;
      
      let matchesDate = true;
      if (startDate) {
        const start = new Date(startDate + 'T00:00:00').getTime();
        matchesDate = matchesDate && opTime >= start;
      }
      if (endDate) {
        const end = new Date(endDate + 'T23:59:59').getTime();
        matchesDate = matchesDate && opTime <= end;
      }

      return matchesSearch && matchesUope && matchesId && matchesStatus && matchesFinalReport && matchesCircumstance && matchesDate;
    });
  }, [operations, searchTerm, filterUope, filterId, filterStatus, filterFinalReport, filterCircumstance, startDate, endDate]);

  const filteredSummary = useMemo(() => {
    const uopeUniqueIds: Record<string, Set<string>> = {};
    const allUniqueIds = new Set<string>();
    
    filteredData.forEach(op => {
      const nid = normalizeId(op.id);
      allUniqueIds.add(nid);
      
      if (!uopeUniqueIds[op.uope]) uopeUniqueIds[op.uope] = new Set();
      uopeUniqueIds[op.uope].add(nid);
    });

    const uniqueCount = allUniqueIds.size;
    const extraLines = filteredData.length - uniqueCount;

    return {
      uopeList: Object.entries(uopeUniqueIds)
        .map(([name, ids]) => ({ name, total: ids.size }))
        .sort((a, b) => b.total - a.total),
      uniqueCount,
      extraLines,
      activeUnits: Object.keys(uopeUniqueIds).length
    };
  }, [filteredData]);

  // Analysis logic
  const stats = useMemo((): DashboardStats => {
    const idCounts: Record<string, number> = {};
    const uopeCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    const circumstanceCounts: Record<string, number> = {};
    const dateCounts: Record<string, number> = {};
    const uopeDuplicateCounts: Record<string, number> = {};

    filteredData.forEach((op) => {
      const nid = normalizeId(op.id);
      idCounts[nid] = (idCounts[nid] || 0) + 1;
      uopeCounts[op.uope] = (uopeCounts[op.uope] || 0) + 1;
      statusCounts[op.status] = (statusCounts[op.status] || 0) + 1;
      circumstanceCounts[op.circumstance] = (circumstanceCounts[op.circumstance] || 0) + 1;
      if (op.status === "Finalizado") {
        dateCounts[op.date] = (dateCounts[op.date] || 0) + 1;
      }
    });

    const duplicateIds = Object.keys(idCounts).filter((id) => idCounts[id] > 1);
    
    // Count duplicates per UOpE
    filteredData.forEach((op) => {
      const nid = normalizeId(op.id);
      if (duplicateIds.includes(nid) && op.uope.trim() !== "") {
        uopeDuplicateCounts[op.uope] = (uopeDuplicateCounts[op.uope] || 0) + 1;
      }
    });

    const mostDuplicatedUopeEntry = Object.entries(uopeDuplicateCounts)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      total: filteredData.length,
      uniqueOperations: Object.keys(idCounts).length,
      correctlyLaunched: Object.keys(idCounts).length - duplicateIds.length,
      duplicates: duplicateIds.length,
      byUope: Object.entries(uopeCounts)
        .filter(([name]) => name.trim() !== "")
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
      byStatus: Object.entries(statusCounts)
        .filter(([name]) => name.trim() !== "")
        .map(([name, value]) => ({ name, value })),
      byCircumstance: Object.entries(circumstanceCounts)
        .filter(([name]) => name.trim() !== "")
        .map(([name, value]) => ({ name, value })),
      byDate: Object.entries(dateCounts)
        .map(([name, value]) => ({ name, value, timestamp: parseDateToTimestamp(name) }))
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(({ name, value }) => ({ name, value })),
      duplicateIds,
      mostDuplicatedUope: mostDuplicatedUopeEntry ? { name: mostDuplicatedUopeEntry[0], count: mostDuplicatedUopeEntry[1] } : undefined,
      topDuplicatedUopes: Object.entries(uopeDuplicateCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    };
  }, [filteredData]);

  const duplicateAlerts = useMemo(() => {
    const idMap: Record<string, Operation[]> = {};
    operations.forEach(op => {
      const nid = normalizeId(op.id);
      if (!idMap[nid]) idMap[nid] = [];
      idMap[nid].push(op);
    });

    return Object.entries(idMap)
      .filter(([nid, ops]) => ops.length > 1)
      .map(([nid, ops]) => ({
        id: ops[0].id, // Use the original ID format from the first occurrence
        count: ops.length,
        ops
      }));
  }, [operations]);

  const isAnyFilterActive = !!(searchTerm || filterUope || filterId || filterStatus || filterFinalReport || filterCircumstance || startDate || endDate);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]);
      setImportError(null);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Calculate duplicates within filtered data for highlighting
    const idCounts: Record<string, number> = {};
    filteredData.forEach(op => {
      const nid = normalizeId(op.id);
      idCounts[nid] = (idCounts[nid] || 0) + 1;
    });
    const duplicateIds = Object.entries(idCounts)
      .filter(([_, count]) => count > 1)
      .map(([nid]) => nid);

    // Header
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text("Estado Maior Geral - PM/3", 105, 15, { align: "center" });
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text("Dados ADPF - Relatório de Operações", 105, 22, { align: "center" });
    
    // Summary Section
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(14, 28, 196, 28);
    
    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85); // slate-700
    doc.setFont("helvetica", "bold");
    doc.text("RESUMO DA FILTRAGEM:", 14, 36);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Volume Total de Registros: ${filteredData.length}`, 14, 42);
    doc.setTextColor(185, 28, 28); // rose-700
    doc.text(`Total de Linhas em Duplicidade: ${filteredSummary.extraLines}`, 14, 49);
    
    if (filterUope) {
      doc.setTextColor(51, 65, 85);
      doc.text(`Unidade Selecionada: ${filterUope}`, 14, 56);
    }

    // Detailed Duplicate Info if any
    let currentY = filterUope ? 65 : 58;
    if (duplicateIds.length > 0) {
      doc.setFontSize(9);
      doc.setTextColor(180, 83, 9); // amber-700
      doc.setFont("helvetica", "bold");
      doc.text("IDs DUPLICADOS NESTE RELATÓRIO:", 14, currentY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const dupText = duplicateIds.map(id => `${id} (${idCounts[id]}x)`).join(", ");
      const splitText = doc.splitTextToSize(dupText, 180);
      doc.text(splitText, 14, currentY + 5);
      currentY += (splitText.length * 4) + 8;
    }

    // Table Data
    const tableRows = filteredData.map(op => [
      idCounts[op.id] > 1 ? `${op.id} (*)` : op.id,
      `${op.date} ${op.time}`,
      op.uope,
      op.location,
      op.finalReport
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["Nº Operação", "Data/Hora", "UOpE", "Local", "Relatório Final"]],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 30 },
        2: { cellWidth: 35 },
        4: { cellWidth: 25 }
      },
      didParseCell: (data) => {
        // Highlight duplicate rows in light amber
        if (data.section === 'body') {
          const rowId = filteredData[data.row.index].id;
          const nid = normalizeId(rowId);
          if (idCounts[nid] > 1) {
            data.cell.styles.fillColor = [254, 243, 199]; // amber-100
            data.cell.styles.textColor = [146, 64, 14]; // amber-800
          }
        }
      },
      didDrawPage: (data) => {
        // Footer
        const str = "Dev.Fiel.26";
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(str, 105, pageHeight - 10, { align: "center" });
        doc.text(`Página ${data.pageNumber}`, 196, pageHeight - 10, { align: "right" });
        
        // Legend for duplicates
        if (duplicateIds.length > 0) {
          doc.setFontSize(7);
          doc.setTextColor(180, 83, 9);
          doc.text("(*) Indica registro com ID duplicado (destacado em amarelo)", 14, pageHeight - 10);
        }
      }
    });

    const fileName = filterUope ? `Relatorio_${filterUope}.pdf` : "Relatorio_Operacoes.pdf";
    doc.save(fileName);
  };

  const generateQuantityPDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text("Estado Maior Geral - PM/3", 105, 15, { align: "center" });
    doc.setFontSize(14);
    doc.setTextColor(51, 65, 85);
    doc.text("Relatório Geral de Produtividade Operacional", 105, 23, { align: "center" });
    
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 30, 196, 30);
    
    // Summary Section
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text("ESTATÍSTICAS GERAIS DO PERÍODO:", 14, 40);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Volume Total de Registros: ${filteredData.length}`, 14, 48);
    doc.text(`Nº de Operações Realizadas: ${filteredSummary.uniqueCount}`, 14, 55);
    doc.text(`Unidades Operacionais Ativas: ${filteredSummary.activeUnits}`, 14, 62);
    
    doc.setTextColor(30, 41, 59);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 72);

    // Table Data - Sorted by Total
    // Filter to only show UOpEs with unique operations
    const tableRows = filteredSummary.uopeList.map((item, index) => [
      (index + 1).toString(),
      item.name,
      item.total.toString(),
      `${((item.total / filteredSummary.uniqueCount) * 100).toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: 80,
      head: [["Pos.", "Unidade Operacional (UOpE)", "Qtd. Operações", "% do Total"]],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        2: { halign: 'center', cellWidth: 45 },
        3: { halign: 'center', cellWidth: 30 }
      },
      didDrawPage: (data) => {
        const str = "Dev.Fiel.26 - Sistema de Auditoria de Operações";
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(str, 105, pageHeight - 10, { align: "center" });
        doc.text(`Página ${data.pageNumber}`, 196, pageHeight - 10, { align: "right" });
      }
    });

    doc.save("Relatorio_Produtividade_Geral.pdf");
  };

  const handleImportData = () => {
    if (!importFile) return;

    Papa.parse(importFile, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const newOps: Operation[] = results.data.map((row: any) => {
          // Find keys case-insensitively if needed, but transformHeader helps
          const getVal = (possibleKeys: string[]) => {
            const key = possibleKeys.find(k => row[k] !== undefined);
            return key ? String(row[key]).trim() : "";
          };

          return {
            id: getVal(["N da Operação", "Nº Operação", "N da Operacao", "N da Operação"]),
            date: getVal(["Data"]),
            time: getVal(["Hora"]),
            uope: getVal(["UOpE", "Uope", "Unidade"]),
            location: getVal(["Local"]).replace(/^"|"$/g, ''),
            circumstance: getVal(["Circustância", "Circunstância", "Circustancia"]),
            initialCommunication: getVal(["Comunicação Inicial", "Comunicacao Inicial", "Comunicação Inicial"]),
            finalReport: getVal(["Relatório Final", "Relatorio Final", "Relatório Final"]),
            status: getVal(["Situação", "Situacao", "Status", "Situação"])
          };
        }).filter(op => op.id && op.uope); // Filter out rows without ID or UOpE

        if (newOps.length > 0) {
          // Replace operations with new ones to avoid "497 vazios" from previous imports
          setOperations(newOps);
          setIsImporting(false);
          setImportFile(null);
          setImportError(null);
        } else {
          setImportError("Nenhum dado válido encontrado no arquivo. Verifique se os cabeçalhos das colunas estão corretos (N da Operação, Data, UOpE, etc) e se o arquivo não está vazio.");
        }
      },
      error: (err) => {
        setImportError(`Erro ao processar arquivo: ${err.message}`);
      }
    });
  };

  const uniqueUopes = Array.from(new Set(operations.map((op) => op.uope))).sort();
  const uniqueStatuses = Array.from(new Set(operations.map((op) => op.status))).sort();
  const uniqueFinalReports = Array.from(new Set(operations.map((op) => op.finalReport))).sort();
  const uniqueCircumstances = Array.from(new Set(operations.map((op) => op.circumstance))).sort();

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-800">Painel de Operações Policiais</h1>
          <p className="text-slate-500">Análise de dados e detecção de duplicidades operacionais</p>
        </div>
        <div className="flex gap-3">
          {operations.length > 0 && (
            <button 
              onClick={() => {
                setOperations([]);
                clearFilters();
              }}
              className="px-4 py-3 bg-white border border-rose-200 text-rose-600 rounded-xl font-bold hover:bg-rose-50 transition-all flex items-center justify-center shadow-sm"
            >
              <RotateCcw className="mr-2" size={20} />
              Limpar Dados
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      {operations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 animate-in fade-in zoom-in duration-700">
          <div className="max-w-2xl w-full px-6 text-center">
            <div className="inline-flex p-5 bg-blue-50 text-blue-600 rounded-3xl mb-8 shadow-inner">
              <Upload size={48} className="animate-bounce" />
            </div>
            
            <h2 className="text-3xl font-extrabold text-slate-800 mb-4">
              Bem-vindo ao Sistema de Auditoria PM/3
            </h2>
            <p className="text-slate-500 mb-12 text-lg leading-relaxed">
              Carregue seu arquivo CSV para iniciar a análise de produtividade, 
              identificar duplicidades e gerar relatórios oficiais.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 text-left">
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center mb-3">
                  <CheckCircle size={20} />
                </div>
                <h4 className="font-bold text-slate-700 text-sm mb-1">Auditoria</h4>
                <p className="text-xs text-slate-500">Detecção automática de IDs repetidos.</p>
              </div>
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-3">
                  <TrendingUp size={20} />
                </div>
                <h4 className="font-bold text-slate-700 text-sm mb-1">Gráficos</h4>
                <p className="text-xs text-slate-500">Visualização dinâmica de produtividade.</p>
              </div>
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center mb-3">
                  <FileText size={20} />
                </div>
                <h4 className="font-bold text-slate-700 text-sm mb-1">Relatórios</h4>
                <p className="text-xs text-slate-500">Exportação profissional em PDF.</p>
              </div>
            </div>

            <button 
              onClick={() => {
                setIsImporting(true);
                setImportError(null);
                setImportFile(null);
              }}
              className="group relative px-10 py-5 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-1 active:translate-y-0 transition-all duration-300 flex items-center gap-3 mx-auto"
            >
              <Upload size={24} className="group-hover:rotate-12 transition-transform" />
              IMPORTAR ARQUIVO CSV
              <div className="absolute -inset-1 bg-blue-400/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
              <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
                <FileText size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total de Registros</p>
                <p className="text-2xl font-bold text-slate-700">{stats.total}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
              <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600">
                <CheckCircle size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Operações</p>
                <p className="text-2xl font-bold text-emerald-600">{stats.uniqueOperations}</p>
              </div>
            </div>
          </div>
      
      <div className="bg-white p-8 rounded-3xl shadow-lg shadow-slate-200/60 border border-slate-200 mb-10 flex flex-col lg:flex-row justify-between items-center gap-8 relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="absolute top-0 left-0 w-2 h-full bg-blue-600"></div>
        
        <div className="flex items-center gap-6">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl shadow-inner">
            <TrendingUp size={32} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">Central de Relatórios</h2>
            <p className="text-slate-500">Emissão de documentos oficiais e estatísticos</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
          <button 
            onClick={generateQuantityPDF} 
            className="group flex-1 sm:flex-none px-8 py-4 bg-slate-100 text-slate-700 rounded-2xl font-black text-sm flex items-center justify-center gap-3 hover:bg-slate-200 hover:scale-105 hover:shadow-xl transition-all duration-300 border border-slate-200"
          >
            <TrendingUp size={18} className="text-blue-600 group-hover:scale-125 transition-transform" />
            RELATÓRIO DE PRODUTIVIDADE
          </button>
          
          <button 
            onClick={generatePDF} 
            className="group flex-1 sm:flex-none px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-3 hover:bg-blue-700 hover:scale-105 hover:shadow-2xl hover:shadow-blue-200 transition-all duration-300"
          >
            <AlertTriangle size={18} className="text-blue-200 group-hover:rotate-12 transition-transform" />
            RELATÓRIO DE AUDITORIA
          </button>
        </div>
      </div>

      {/* Alert System Section - Focus on Duplicates */}
      {duplicateAlerts.length > 0 && (
        <div className="mb-8 bg-amber-50 border border-amber-100 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
              <AlertTriangle size={20} className="animate-pulse" />
            </div>
            <h2 className="text-lg font-bold text-amber-900 flex items-center gap-2">
              Alerta de Prioridade: Duplicidades Detectadas
              <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded-full">{filteredSummary.extraLines} Registros Duplicados</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {duplicateAlerts.slice(0, 6).map((alert, i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono text-sm font-bold text-amber-700">{alert.id}</span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold uppercase">
                      {alert.count} duplicidades
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">UOpEs envolvidas:</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(new Set(alert.ops.map(o => o.uope))).map((u, idx) => (
                      <span key={idx} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-50 flex justify-end">
                  <button 
                    onClick={() => {
                      clearFilters();
                      setFilterId(alert.id);
                      tableRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Ver Todas as Ocorrências
                  </button>
                </div>
              </div>
            ))}
            {duplicateAlerts.length > 6 && (
              <div className="flex items-center justify-center p-4 bg-amber-100/50 rounded-xl border border-dashed border-amber-300">
                <p className="text-sm font-bold text-amber-700">+{duplicateAlerts.length - 6} outros IDs duplicados</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Distribuição por UOpE */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-800">Distribuição por UOpE</h2>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-slate-800 text-white text-[10px] font-bold rounded-md uppercase">Ranking (Top 10)</span>
            </div>
          </div>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byUope.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={100} 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fill: '#64748b', fontWeight: 600 }}
                />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} label={{ position: 'right', fill: '#1e293b', fontSize: 11, fontWeight: 'bold' }}>
                  {stats.byUope.slice(0, 10).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribuição por Circunstância */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-6">Distribuição por Circunstância</h2>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.byCircumstance}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={130}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="#fff"
                  strokeWidth={2}
                  label={({ name, value }) => `${value}`}
                >
                  {stats.byCircumstance.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 1) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="center"
                  iconType="rect"
                  wrapperStyle={{ paddingBottom: '20px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Evolução de Operações */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-6">Evolução de Operações (Série Temporal)</h2>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.byDate} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e293b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#1e293b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tick={{ fill: '#64748b', fontWeight: 500 }}
                  angle={-45}
                  textAnchor="end"
                  interval={Math.ceil(stats.byDate.length / 10)}
                />
                <YAxis 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tick={{ fill: '#64748b', fontWeight: 500 }}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="center"
                  iconType="rect"
                  wrapperStyle={{ paddingBottom: '20px' }}
                />
                <Area 
                  name="Operações por Dia"
                  type="monotone" 
                  dataKey="value" 
                  stroke="#1e293b" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorValue)" 
                  dot={{ r: 4, fill: '#1e293b', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribuição por Situação */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-6">Distribuição por Situação</h2>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byStatus} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false} 
                  tick={{ fill: '#64748b', fontWeight: 600 }}
                />
                <YAxis 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tick={{ fill: '#64748b', fontWeight: 500 }}
                />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" barSize={60} radius={[4, 4, 0, 0]}>
                  {stats.byStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>


      {/* Filters & Table Section */}
      <div ref={tableRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-12">
        <div className="p-6 border-bottom border-slate-100 bg-slate-50/50 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Buscar por Local..."
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1">
              <Calendar size={16} className="text-slate-400" />
              <input 
                type="date" 
                className="text-sm outline-none bg-transparent"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span className="text-slate-300">|</span>
              <input 
                type="date" 
                className="text-sm outline-none bg-transparent"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">N. Operação:</span>
              <input
                type="text"
                placeholder="ID..."
                className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={filterId}
                onChange={(e) => setFilterId(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">UOpE:</span>
              <select
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={filterUope}
                onChange={(e) => setFilterUope(e.target.value)}
              >
                <option value="">Todas</option>
                {uniqueUopes.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Situação:</span>
              <select
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Todas</option>
                {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Relatório Final:</span>
              <select
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={filterFinalReport}
                onChange={(e) => setFilterFinalReport(e.target.value)}
              >
                <option value="">Todos</option>
                {uniqueFinalReports.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Circunstância:</span>
              <select
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                value={filterCircumstance}
                onChange={(e) => setFilterCircumstance(e.target.value)}
              >
                <option value="">Todas</option>
                {uniqueCircumstances.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
            >
              <RotateCcw size={16} />
              Limpar Filtros
            </button>
          </div>
        </div>

        {/* Filter Summary Card */}
        {isAnyFilterActive && filteredData.length > 0 && (
          <div className="px-6 py-4 border-b border-slate-100 bg-blue-50/30 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex flex-col gap-1 shrink-0">
                <div className="flex items-center gap-2 text-blue-700">
                  <Info size={18} />
                  <span className="text-sm font-bold uppercase tracking-tight">Resumo da Filtragem:</span>
                </div>
                <div className="flex gap-3 mt-1">
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase">
                    {filteredData.length} Registros
                  </span>
                  <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase">
                    {filteredSummary.extraLines} Duplicados
                  </span>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 flex-1">
                {filteredSummary.uopeList.slice(0, 8).map((stat, i) => (
                  <div key={i} className="flex flex-col bg-white border border-blue-100 rounded-lg px-3 py-1.5 shadow-sm min-w-[100px]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase truncate">{stat.name}</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-black text-slate-700">{stat.total}</span>
                    </div>
                  </div>
                ))}
                {filteredSummary.uopeList.length > 8 && (
                  <span className="text-xs text-slate-400 self-center font-medium">
                    + {filteredSummary.uopeList.length - 8} outras
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="max-h-[600px] overflow-y-auto relative">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="px-6 py-4 border-b border-slate-100">Nº Operação</th>
                <th className="px-6 py-4 border-b border-slate-100">Data/Hora</th>
                <th className="px-6 py-4 border-b border-slate-100">UOpE</th>
                <th className="px-6 py-4 border-b border-slate-100">Local</th>
                <th className="px-6 py-4 border-b border-slate-100">Relatório Final</th>
                <th className="px-6 py-4 border-b border-slate-100">Situação</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.map((op, idx) => {
                const isDuplicate = stats.duplicateIds.includes(op.id);
                return (
                  <tr 
                    key={idx} 
                    onClick={() => setSelectedOp(op)}
                    className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <span className="font-mono text-sm font-medium">{op.id}</span>
                        {isDuplicate && (
                          <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full uppercase">
                            Repetida
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {op.date} <span className="text-slate-400 ml-1">{op.time}</span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">{op.uope}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 truncate max-w-[200px]" title={op.location}>
                      {op.location}
                    </td>
                    <td className="px-6 py-4 text-sm">
                       <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        op.finalReport === 'Enviado' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                        'bg-amber-50 text-amber-600 border border-amber-100'
                      }`}>
                        {op.finalReport}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        op.status === 'Finalizado' ? 'bg-emerald-100 text-emerald-700' : 
                        op.status === 'Em andamento' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {op.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="p-2 text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 rounded-lg transition-all inline-block">
                        <ChevronRight size={18} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredData.length === 0 && (
            <div className="p-12 text-center text-slate-400">
              Nenhum registro encontrado para os filtros selecionados.
            </div>
          )}
        </div>
      </div>

      <footer className="mt-auto py-8 text-center border-t border-slate-200">
        <p className="text-slate-400 text-sm font-medium tracking-widest uppercase">
          Dev.Fiel.26
        </p>
      </footer>
      </>
      )}

      {/* Details Modal */}
      {selectedOp && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Detalhes da Operação</h3>
                <p className="text-sm text-slate-500 font-mono">{selectedOp.id}</p>
              </div>
              <button 
                onClick={() => setSelectedOp(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 block mb-1">Data e Hora</label>
                  <p className="text-slate-700 font-medium">{selectedOp.date} às {selectedOp.time}</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 block mb-1">UOpE</label>
                  <p className="text-slate-700 font-medium">{selectedOp.uope}</p>
                </div>
              </div>
              
              <div>
                <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 block mb-1">Localização</label>
                <p className="text-slate-700 font-medium">{selectedOp.location}</p>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 block mb-1">Circunstância</label>
                <p className="text-slate-700 font-medium">{selectedOp.circumstance}</p>
              </div>

              <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 block mb-1">Relatório Final</label>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${selectedOp.finalReport === 'Enviado' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                    <p className="text-slate-700 font-medium">{selectedOp.finalReport}</p>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 block mb-1">Situação Atual</label>
                  <p className={`font-bold ${selectedOp.status === 'Finalizado' ? 'text-emerald-600' : 'text-blue-600'}`}>
                    {selectedOp.status.toUpperCase()}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setSelectedOp(null)}
                className="px-6 py-2 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImporting && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <Upload size={20} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Importar Arquivo CSV</h3>
              </div>
              <button 
                onClick={() => setIsImporting(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
                <Info className="text-blue-500 shrink-0" size={20} />
                <div className="text-sm text-blue-700">
                  <p className="font-bold mb-1">Requisitos do Arquivo:</p>
                  <p>O arquivo deve ser um CSV (separado por vírgula ou ponto e vírgula) contendo as colunas padrão do sistema ADPF.</p>
                </div>
              </div>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  importFile ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv"
                  className="hidden"
                />
                <div className={`p-4 rounded-full mb-4 ${importFile ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  <Upload size={32} />
                </div>
                {importFile ? (
                  <div className="text-center">
                    <p className="font-bold text-slate-800">{importFile.name}</p>
                    <p className="text-xs text-slate-500">{(importFile.size / 1024).toFixed(2)} KB</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="font-bold text-slate-700">Clique para selecionar ou arraste o arquivo</p>
                    <p className="text-xs text-slate-400 mt-1">Apenas arquivos .csv</p>
                  </div>
                )}
              </div>

              {importError && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex gap-3">
                  <AlertTriangle className="text-rose-500 shrink-0" size={20} />
                  <p className="text-sm text-rose-700 font-medium">{importError}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button 
                  onClick={() => setIsImporting(false)}
                  className="px-6 py-2 border border-slate-300 text-slate-600 rounded-xl font-medium hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleImportData}
                  disabled={!importFile}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Processar Arquivo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}