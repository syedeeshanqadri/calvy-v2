"use client";
import { useEffect, useState, useCallback } from "react";
import { Newspaper, Plus, Pencil, Trash2, ArrowLeft, ExternalLink, Eye, EyeOff, Upload } from "lucide-react";

interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  authorName: string;
  tags: string;
  seoTitle: string | null;
  seoDescription: string | null;
  faq: string;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
}

interface FaqItem { q: string; a: string }

const EMPTY = {
  title: "", slug: "", excerpt: "", content: "", coverImage: "",
  authorName: "Calvy Team", tags: "", seoTitle: "", seoDescription: "", published: false,
};

export default function BlogClient() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Post | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/blog");
    if (res.ok) setPosts((await res.json()).posts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm({ ...EMPTY });
    setFaqItems([]);
    setError("");
    setEditing("new");
  }
  function openEdit(p: Post) {
    setForm({
      title: p.title, slug: p.slug, excerpt: p.excerpt ?? "", content: p.content,
      coverImage: p.coverImage ?? "", authorName: p.authorName, tags: p.tags,
      seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "", published: p.published,
    });
    try { const parsed = JSON.parse(p.faq || "[]"); setFaqItems(Array.isArray(parsed) ? parsed : []); }
    catch { setFaqItems([]); }
    setError("");
    setEditing(p);
  }

  async function save() {
    if (!form.title.trim() || !form.content.trim()) { setError("Title and content are required."); return; }
    setSaving(true); setError("");
    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/admin/blog" : `/api/admin/blog/${(editing as Post).id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, faq: faqItems.filter(f => f.q.trim() && f.a.trim()) }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Failed to save."); return; }
    setEditing(null);
    load();
  }

  async function remove(p: Post) {
    if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return;
    await fetch(`/api/admin/blog/${p.id}`, { method: "DELETE" });
    load();
  }

  const set = (k: keyof typeof form, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/blog/upload", { method: "POST", body: fd });
    setUploading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Upload failed."); return; }
    set("coverImage", data.url);
    e.target.value = "";
  }

  // ── Editor view ──────────────────────────────────────────────
  if (editing) {
    return (
      <div className="max-w-3xl mx-auto p-5 sm:p-8">
        <button onClick={() => setEditing(null)} className="flex items-center gap-2 text-sm text-[#6b6b80] hover:text-[#0f0f1a] mb-6">
          <ArrowLeft size={16} /> Back to posts
        </button>
        <h1 className="font-syne font-bold text-2xl mb-6">{editing === "new" ? "New post" : "Edit post"}</h1>

        <div className="space-y-4">
          <Field label="Title">
            <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="How to reduce no-shows by 80%"
              className="inp" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Slug (optional — auto from title)">
              <input value={form.slug} onChange={e => set("slug", e.target.value)} placeholder="reduce-no-shows" className="inp" />
            </Field>
            <Field label="Author">
              <input value={form.authorName} onChange={e => set("authorName", e.target.value)} className="inp" />
            </Field>
          </div>
          <Field label="Excerpt (shown in listings & meta description fallback)">
            <textarea value={form.excerpt} onChange={e => set("excerpt", e.target.value)} rows={2} className="inp" />
          </Field>
          <Field label="Cover image">
            {form.coverImage && (
              <div className="relative mb-3 rounded-xl overflow-hidden border border-[#e8e6e0]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.coverImage} alt="Cover preview" className="w-full max-h-52 object-cover" />
                <button type="button" onClick={() => set("coverImage", "")}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-lg px-2.5 py-1 text-xs font-medium">
                  Remove
                </button>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <label className={`cursor-pointer inline-flex items-center gap-2 border border-[#e8e6e0] rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-[#f8f7f4] ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                <Upload size={15} /> {uploading ? "Uploading…" : "Upload image"}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleUpload} />
              </label>
              <span className="text-xs text-[#9b9b9b]">PNG/JPG up to 5 MB · or paste a URL</span>
            </div>
            <input value={form.coverImage} onChange={e => set("coverImage", e.target.value)} placeholder="https://…" className="inp mt-2" />
          </Field>
          <Field label="Content (Markdown)">
            <textarea value={form.content} onChange={e => set("content", e.target.value)} rows={16}
              placeholder={"## Heading\n\nWrite your post in **Markdown**.\n\n- bullet\n- list\n\n[link](https://calvy.io)"}
              className="inp font-mono text-[13px]" />
          </Field>
          <Field label="Tags (comma-separated)">
            <input value={form.tags} onChange={e => set("tags", e.target.value)} placeholder="bookings, growth" className="inp" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="SEO title (optional)">
              <input value={form.seoTitle} onChange={e => set("seoTitle", e.target.value)} className="inp" />
            </Field>
            <Field label="SEO description (optional)">
              <input value={form.seoDescription} onChange={e => set("seoDescription", e.target.value)} className="inp" />
            </Field>
          </div>

          {/* FAQ — renders as an accordion + FAQPage schema on the post */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-[#374151]">FAQ (rich-result schema)</label>
              <button type="button" onClick={() => setFaqItems(items => [...items, { q: "", a: "" }])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700">
                <Plus size={14} /> Add question
              </button>
            </div>
            {faqItems.length === 0 && <p className="text-xs text-[#9b9b9b] mb-2">Add Q&amp;A pairs to generate an FAQ section + Google FAQ rich results.</p>}
            <div className="space-y-3">
              {faqItems.map((f, i) => (
                <div key={i} className="rounded-xl border border-[#e8e6e0] p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={f.q} placeholder="Question"
                      onChange={e => setFaqItems(items => items.map((it, j) => j === i ? { ...it, q: e.target.value } : it))}
                      className="inp flex-1" />
                    <button type="button" onClick={() => setFaqItems(items => items.filter((_, j) => j !== i))}
                      className="text-[#9b9b9b] hover:text-red-600 p-1"><Trash2 size={15} /></button>
                  </div>
                  <textarea value={f.a} placeholder="Answer" rows={2}
                    onChange={e => setFaqItems(items => items.map((it, j) => j === i ? { ...it, a: e.target.value } : it))}
                    className="inp w-full" />
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer py-2">
            <input type="checkbox" checked={form.published} onChange={e => set("published", e.target.checked)} className="w-4 h-4 accent-sky-600" />
            <span className="text-sm font-medium">Published {form.published ? "(visible on /blog)" : "(draft)"}</span>
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={save} disabled={saving}
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl px-6 py-2.5 text-sm disabled:opacity-50">
              {saving ? "Saving…" : editing === "new" ? "Create post" : "Save changes"}
            </button>
            <button onClick={() => setEditing(null)} className="text-sm text-[#6b6b80] px-4">Cancel</button>
          </div>
        </div>

        <style jsx>{`.inp{width:100%;border:1px solid #e8e6e0;border-radius:12px;padding:10px 14px;font-size:14px;outline:none;background:#fff}
          .inp:focus{border-color:#0284c7;box-shadow:0 0 0 3px rgba(2,132,199,.12)}`}</style>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto p-5 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <Newspaper size={22} className="text-sky-600" />
          <h1 className="font-syne font-bold text-2xl">Blog</h1>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm">
          <Plus size={16} /> New post
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[#6b6b80]">Loading…</p>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[#e8e6e0] rounded-2xl">
          <Newspaper size={32} className="text-[#c5c3bf] mx-auto mb-3" />
          <p className="text-sm font-medium">No posts yet</p>
          <p className="text-xs text-[#6b6b80] mt-1">Create your first article to start the blog.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map(p => (
            <div key={p.id} className="flex items-center gap-3 bg-white border border-[#e8e6e0] rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{p.title}</span>
                  {p.published
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><Eye size={10} /> Live</span>
                    : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full"><EyeOff size={10} /> Draft</span>}
                </div>
                <p className="text-xs text-[#6b6b80] mt-0.5 truncate">/blog/{p.slug}</p>
              </div>
              {p.published && (
                <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="text-[#6b6b80] hover:text-sky-600 p-1.5" title="View">
                  <ExternalLink size={15} />
                </a>
              )}
              <button onClick={() => openEdit(p)} className="text-[#6b6b80] hover:text-sky-600 p-1.5" title="Edit"><Pencil size={15} /></button>
              <button onClick={() => remove(p)} className="text-[#6b6b80] hover:text-red-600 p-1.5" title="Delete"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#374151] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
