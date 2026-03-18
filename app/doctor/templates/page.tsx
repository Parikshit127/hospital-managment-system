"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/app/components/layout/Sidebar";
import {
  FileText,
  Plus,
  Search,
  Edit3,
  Trash2,
  CheckCircle2,
  Copy,
  X,
  Loader2,
} from "lucide-react";
import {
  getTemplates,
  saveTemplate,
  deleteTemplate,
} from "@/app/actions/doctor-actions";

interface Template {
  id: string;
  title: string;
  type: string;
  contentPreview: string;
  used: number;
  lastUpdated: string;
}

export default function DoctorTemplates() {
  const [session, setSession] = useState<{
    id: string;
    username: string;
    role: string;
    name?: string;
    specialty?: string;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    type: "Clinical Note",
    content: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/session");
        if (res.ok) {
          const data = await res.json();
          setSession(data);
        }
      } catch (e) {
        console.error("Failed to fetch session", e);
      }
    }
    fetchSession();
  }, []);

  const fetchTemplates = useCallback(async () => {
    if (!session?.id) return;
    setLoading(true);
    try {
      const res = await getTemplates(session.id);
      if (res.success && res.data) {
        setTemplates(res.data as Template[]);
      }
    } catch (error) {
      console.error("Failed to fetch templates", error);
    } finally {
      setLoading(false);
    }
  }, [session?.id]);

  useEffect(() => {
    if (session?.id) {
      fetchTemplates();
    }
  }, [session?.id, fetchTemplates]);

  const handleOpenModal = (t?: Template) => {
    if (t) {
      setEditingTemplate(t);
      setFormData({ title: t.title, type: t.type, content: t.contentPreview });
    } else {
      setEditingTemplate(null);
      setFormData({ title: "", type: "Clinical Note", content: "" });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTemplate(null);
    setFormData({ title: "", type: "Clinical Note", content: "" });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.id) return;

    setIsSaving(true);
    try {
      const res = await saveTemplate({
        id: editingTemplate?.id,
        doctorId: session.id,
        title: formData.title,
        type: formData.type,
        content: formData.content,
      });

      if (res.success) {
        await fetchTemplates();
        handleCloseModal();
      } else {
        alert("Failed to save template");
      }
    } catch (error) {
      console.error(error);
      alert("Error saving template");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const res = await deleteTemplate(id);
      if (res.success) {
        await fetchTemplates();
      } else {
        alert("Failed to delete template");
      }
    } catch (error) {
      console.error(error);
      alert("Error deleting template");
    }
  };

  const filteredTemplates = templates.filter((t) =>
    t.title.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Stats calc
  const totalUses = templates.reduce((acc, curr) => acc + curr.used, 0);

  const inputCls =
    "w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400 transition-all shadow-sm";
  const modalInputCls =
    "w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 outline-none font-medium text-gray-900 placeholder:text-gray-400 transition-all shadow-sm";

  return (
    <div className="flex h-[calc(100vh-52px)] bg-gray-50 font-sans text-gray-900 overflow-hidden relative lg:pl-(--sidebar-offset)">
      <Sidebar session={session} />

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-black text-lg text-gray-800 flex items-center gap-2">
                <FileText className="h-5 w-5 text-violet-500" />
                {editingTemplate ? "Edit Template" : "Create Template"}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Template Title
                </label>
                <input
                  required
                  placeholder="e.g. Standard General Checkup"
                  className={modalInputCls}
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Template Type
                </label>
                <select
                  className={modalInputCls}
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                >
                  <option>Clinical Note</option>
                  <option>Prescription/Plan</option>
                  <option>Lab Order</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Content
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Type the template content here. Use placeholders like [SYMPTOM] if needed..."
                  className={modalInputCls}
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold rounded-xl hover:from-violet-400 hover:to-indigo-500 flex items-center gap-2 shadow-lg shadow-violet-500/20 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto w-full">
        <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 border border-gray-200 bg-white rounded-xl shadow-sm">
                  <FileText className="h-6 w-6 text-violet-500" />
                </div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                  Clinical Templates
                </h1>
              </div>
              <p className="text-sm text-gray-500 font-medium">
                Manage your reusable clinical notes and prescription blocks.
              </p>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold rounded-xl hover:from-violet-400 hover:to-indigo-500 transition-all flex items-center gap-2 shadow-lg shadow-violet-500/20 text-sm whitespace-nowrap"
            >
              <Plus className="h-4 w-4" /> Create Template
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-6 rounded-2xl text-white shadow-lg shadow-teal-500/20 flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-xl border border-white/20">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-teal-100 mb-1">
                  Total Templates
                </p>
                <h3 className="text-3xl font-black">
                  {templates.length} Active
                </h3>
              </div>
            </div>
            <div className="bg-gradient-to-br from-violet-500 to-indigo-600 p-6 rounded-2xl text-white shadow-lg shadow-violet-500/20 flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-xl border border-white/20">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-violet-100 mb-1">
                  Status
                </p>
                <h3 className="text-xl font-bold">
                  {loading ? "Loading..." : "Ready"}
                </h3>
              </div>
            </div>
            <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm flex items-center gap-4">
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
                <Copy className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Total Uses
                </p>
                <h3 className="text-3xl font-black text-gray-800">
                  {totalUses}
                </h3>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col mt-6">
            <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between gap-4 items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                <h2 className="font-black text-gray-800 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-violet-400" /> Template
                  Library
                </h2>
              </div>
              <div className="relative w-full sm:w-80 group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-violet-400 transition-colors" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {loading ? (
              <div className="p-16 flex flex-col items-center justify-center text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500 mb-4" />
                <p className="font-medium text-sm">Loading your templates...</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="p-16 flex flex-col items-center justify-center text-gray-400 text-center">
                <FileText className="h-12 w-12 text-gray-300 mb-4" />
                <p className="text-lg font-bold text-gray-600 mb-1">
                  No templates found
                </p>
                <p className="text-sm">
                  Click 'Create Template' to get started.
                </p>
              </div>
            ) : (
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50/30">
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="bg-white border border-gray-200 p-5 rounded-2xl hover:border-violet-500/30 transition-all shadow-sm group"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-gray-900 group-hover:text-violet-600 transition-colors text-lg">
                          {template.title}
                        </h3>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md mt-1.5 inline-block ${
                            template.type === "Clinical Note"
                              ? "bg-teal-500/10 text-teal-600 border border-teal-500/20"
                              : template.type === "Lab Order"
                                ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                : "bg-violet-500/10 text-violet-600 border border-violet-500/20"
                          }`}
                        >
                          {template.type}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenModal(template)}
                          className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <pre className="text-sm text-gray-500 font-sans mt-3 bg-gray-50 p-3 rounded-xl border border-gray-100 whitespace-pre-wrap leading-relaxed truncate group-hover:bg-violet-50/50 group-hover:border-violet-500/10 transition-colors cursor-text">
                      {template.contentPreview}
                    </pre>
                    <div className="flex justify-between items-center mt-5 pt-4 border-t border-gray-100 text-xs text-gray-400 font-medium">
                      <span>Used {template.used} times</span>
                      <span>Updated {template.lastUpdated}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
