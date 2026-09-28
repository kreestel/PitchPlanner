"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Slide = { number: number; text: string; context: string; preview: string; excluded: boolean };
type Script = { number: number; title: string; script: string; missingInfo: string[] };
type Prefs = { type: string; audience: string; duration: number; tone: string; simpleEnglish: boolean; context: string };
const initialPrefs: Prefs = { type: "seminar", audience: "", duration: 5, tone: "natural", simpleEnglish: true, context: "" };
const glyph = (name: string, size = 18) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, React.ReactNode> = { spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 14 1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1L19 14Z"/></>, upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3"/></>, copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>, download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M4 17v3h16v-3"/></>, back: <><path d="m15 18-6-6 6-6"/><path d="M9 12h12"/></>, chevron: <path d="m6 9 6 6 6-6"/>, check: <path d="m5 12 4 4L19 6"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, doc: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></> };
  return <svg {...common}>{paths[name] ?? paths.spark}</svg>;
};
const words = (s: string) => s.trim() ? s.trim().split(/\s+/).length : 0;
const timeLabel = (text: string) => { const sec = Math.max(1, Math.round(words(text) * 60 / 130)); return `~${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };

export default function Home() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [dragging, setDragging] = useState(false);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/status").then(r => r.json()).then(d => setApiConfigured(d.configured)).catch(() => setApiConfigured(false)); }, []);
  const included = slides.filter(s => !s.excluded);
  const totalWords = scripts.reduce((sum, s) => sum + words(s.script), 0);
  const totalMinutes = totalWords / 130;
  const updateSlide = (number: number, patch: Partial<Slide>) => setSlides(prev => prev.map(s => s.number === number ? { ...s, ...patch } : s));
  const updateScript = (number: number, patch: Partial<Script>) => setScripts(prev => prev.map(s => s.number === number ? { ...s, ...patch } : s));

  async function loadPdf(file?: File) {
    if (!file) return;
    setError("");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setError("That file doesn’t look like a PDF. Choose a presentation PDF to continue."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("This PDF is larger than 10 MB. Try a smaller file."); return; }
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const data = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;
      if (pdf.numPages > 20) { setError(`This PDF has ${pdf.numPages} pages. The prototype supports up to 20 slides.`); return; }
      const extracted: Slide[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const text = content.items.map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
        const viewport = page.getViewport({ scale: 0.42 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width)); canvas.height = Math.max(1, Math.floor(viewport.height));
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
        extracted.push({ number: n, text, context: "", preview: canvas.toDataURL("image/jpeg", 0.7), excluded: false });
      }
      setSlides(extracted); setScripts([]); setStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(/password|encrypted/i.test(msg) ? "This PDF is password-protected. Remove its password and try again." : "We couldn’t read this PDF. It may be damaged, password-protected, or use an unsupported format.");
    }
  }

  async function generate() {
    const missing = included.filter(s => !s.text.trim() && !s.context.trim());
    if (missing.length) { setError(`Add context or exclude slide${missing.length > 1 ? "s" : ""} ${missing.map(s => s.number).join(", ")} before generating.`); return; }
    if (!included.length) { setError("Include at least one slide to make a script."); return; }
    if (scripts.length && !window.confirm("Generate a new script? This will replace your edited scripts.")) return;
    setError(""); setBusy(true);
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slides: included.map(s => ({ number: s.number, title: s.text.split(/[.!?\n]/)[0]?.slice(0, 90) || `Slide ${s.number}`, text: s.text, context: s.context })), preferences: prefs }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setScripts(data.slides); setStep(3); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setError(e instanceof Error ? e.message : "Generation failed. Your notes are still saved."); }
    finally { setBusy(false); }
  }
  async function copy(text: string, id: string) { try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1800); } catch { setError("Clipboard access is unavailable. Select and copy the text instead."); } }
  function download() { const text = scripts.map(s => `SLIDE ${s.number} — ${s.title}\n\n${s.script}${s.missingInfo.length ? `\n\n[Check before presenting: ${s.missingInfo.join("; ")}]` : ""}`).join("\n\n────────────────────────\n\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); a.download = "pitchplanner-script.txt"; a.click(); URL.revokeObjectURL(a.href); }
  const percent = Math.min(100, totalMinutes / Math.max(1, prefs.duration) * 100);

  return <main className="min-h-screen">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
      <button className="flex items-center gap-2.5 text-left" onClick={() => { setStep(1); setError(""); }} aria-label="PitchPlanner home"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#7055c8] text-white">{glyph("spark", 20)}</span><span className="text-[17px] font-bold tracking-[-.5px]">pitchplanner<span className="text-[#7055c8]">.</span></span></button>
      <span className="hidden text-sm text-[#77747f] sm:inline">A clearer way to find your words.</span><button onClick={() => { setSlides([]); setScripts([]); setStep(1); setError(""); }} className="text-sm font-semibold text-[#77747f] hover:text-[#7055c8]">Start over</button>
    </header>
    <section className="mx-auto max-w-4xl px-5 pb-14 pt-5 sm:px-8 sm:pt-9">
      <div className="mb-10 flex items-center justify-center gap-2 sm:gap-4" aria-label={`Step ${step} of 3`}>
        {["Upload", "Set up", "Your script"].map((label, i) => <div key={label} className="flex items-center gap-2 sm:gap-4"><div className={`flex items-center gap-2 text-xs font-semibold sm:text-sm ${step === i + 1 ? "text-[#7055c8]" : step > i + 1 ? "text-[#5140a0]" : "text-[#aaa7ad]"}`}><span className={`grid h-7 w-7 place-items-center rounded-full text-xs ${step >= i + 1 ? "bg-[#eee9fb]" : "border border-[#dedbe0]"}`}>{step > i + 1 ? glyph("check", 14) : `0${i + 1}`}</span><span>{label}</span></div>{i < 2 && <span className="h-px w-7 bg-[#e4e0e8] sm:w-14"/>}</div>)}
      </div>

      {step === 1 && <>
        <div className="mb-8 text-center"><div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#f0ecfb] px-3 py-1 text-xs font-semibold text-[#6550b3]">{glyph("spark", 14)} Made for the moment before “any questions?”</div><h1 className="text-4xl font-semibold leading-tight tracking-[-1.6px] sm:text-[52px]">Your slides, in <span className="text-[#7055c8]">your words.</span></h1><p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#77747f]">Turn a presentation into a natural speaking script, one slide at a time. You bring the ideas; we’ll help you find the flow.</p></div>
        <button className={`w-full rounded-[22px] border-2 border-dashed px-6 py-12 text-center transition ${dragging ? "border-[#7055c8] bg-[#f2effb]" : "border-[#ddd9e0] bg-white hover:border-[#9b88d8] hover:bg-[#fdfcff]"}`} onClick={() => fileInput.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void loadPdf(e.dataTransfer.files[0]); }}><span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#f0ecfb] text-[#7055c8]">{glyph("upload", 25)}</span><span className="block text-lg font-semibold">Drop your PDF here, or <span className="text-[#7055c8] underline underline-offset-4">browse files</span></span><span className="mt-2 block text-sm text-[#77747f]">Each PDF page becomes one slide · Up to 20 pages · 10 MB max</span><input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={e => { void loadPdf(e.target.files?.[0]); e.target.value = ""; }}/></button>
        <div className="mt-7 grid gap-4 sm:grid-cols-3"><Mini icon="doc" title="Slide by slide" body="A script that follows your deck."/><Mini icon="spark" title="Sounds like you" body="Choose your audience and tone."/><Mini icon="clock" title="Fits your time" body="Plan for the minutes you have."/></div>
      </>}

      {step === 2 && <>
        <div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[1.5px] text-[#7055c8]">Set up your talk</p><h1 className="text-3xl font-semibold tracking-[-1px] sm:text-4xl">A little context goes a long way.</h1><p className="mt-3 text-sm leading-6 text-[#77747f]">We use extracted slide text and your notes. Slide images are shown as previews; they aren’t interpreted by AI.</p></div>
        <div className="mb-5 rounded-2xl border border-[#e9e6e2] bg-white p-5 sm:p-6"><div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-semibold">Presentation type<select value={prefs.type} onChange={e => setPrefs({ ...prefs, type: e.target.value })} className="mt-2 block w-full rounded-xl border border-[#e3e0e5] bg-white px-3 py-3 font-normal"><option value="seminar">Seminar</option><option value="project presentation">Project presentation</option><option value="business pitch">Business pitch</option><option value="general">General</option></select></label><label className="block text-sm font-semibold">Who’s listening?<input value={prefs.audience} onChange={e => setPrefs({ ...prefs, audience: e.target.value })} placeholder="e.g. classmates and my professor" className="mt-2 block w-full rounded-xl border border-[#e3e0e5] px-3 py-3 font-normal placeholder:text-[#aaa7ad]"/><span className="mt-1 block text-xs font-normal text-[#89858e]">Try: first-year students, a project panel, potential investors</span></label><label className="block text-sm font-semibold">Speaking time <span className="font-normal text-[#89858e]">(minutes)</span><input type="number" min="1" max="120" value={prefs.duration} onChange={e => setPrefs({ ...prefs, duration: Math.max(1, Math.min(120, Number(e.target.value))) })} className="mt-2 block w-full rounded-xl border border-[#e3e0e5] px-3 py-3 font-normal"/></label><label className="block text-sm font-semibold">Tone<select value={prefs.tone} onChange={e => setPrefs({ ...prefs, tone: e.target.value })} className="mt-2 block w-full rounded-xl border border-[#e3e0e5] bg-white px-3 py-3 font-normal"><option value="natural and conversational">Natural and conversational</option><option value="formal and academic">Formal and academic</option><option value="confident and persuasive">Confident and persuasive</option></select></label></div>
          <label className="mt-5 flex cursor-pointer items-center gap-3 border-t border-[#efedf0] pt-5"><input type="checkbox" checked={prefs.simpleEnglish} onChange={e => setPrefs({ ...prefs, simpleEnglish: e.target.checked })} className="h-4 w-4 accent-[#7055c8]"/><span className="text-sm font-medium">Use simple English</span><span className="text-xs text-[#89858e]">— clear and easy to say out loud</span></label>
          <label className="mt-5 block text-sm font-semibold">Anything else we should know? <span className="font-normal text-[#89858e]">(optional)</span><textarea value={prefs.context} onChange={e => setPrefs({ ...prefs, context: e.target.value })} rows={3} placeholder="For example: This is a first-year research project, and I want to focus on what I learned." className="mt-2 block w-full resize-y rounded-xl border border-[#e3e0e5] px-3 py-3 font-normal placeholder:text-[#aaa7ad]"/></label></div>
        <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">Your slides <span className="font-normal text-[#89858e]">({slides.length})</span></h2><button onClick={() => fileInput.current?.click()} className="text-sm font-semibold text-[#7055c8]">Replace PDF</button></div>
        <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={e => { void loadPdf(e.target.files?.[0]); e.target.value = ""; }}/>
        <div className="space-y-3">{slides.map(slide => <article key={slide.number} className={`rounded-2xl border bg-white p-4 sm:p-5 ${slide.excluded ? "opacity-55" : "border-[#e9e6e2]"}`}><div className="flex gap-4"><img src={slide.preview} alt={`Preview of slide ${slide.number}`} className="h-[82px] w-[124px] shrink-0 rounded-lg border border-[#eeeaf0] bg-[#f5f3f0] object-contain sm:h-[102px] sm:w-[156px]"/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-[#7055c8]">Slide {slide.number}</p><p className="mt-1 truncate text-sm font-medium text-[#4c4951]">{slide.text ? slide.text.split(/[.!?\n]/)[0].slice(0, 70) : "No readable text detected"}</p></div><label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[#77747f]"><input type="checkbox" checked={slide.excluded} onChange={e => updateSlide(slide.number, { excluded: e.target.checked })} className="accent-[#7055c8]"/> Exclude</label></div><details className="mt-2 text-xs text-[#77747f]"><summary className="flex w-fit cursor-pointer items-center gap-1">{glyph("chevron", 14)} View extracted text</summary><p className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-[#faf9f6] p-3">{slide.text || "No readable text was extracted from this page."}</p></details></div></div>
          {!slide.excluded && <label className={`mt-4 block text-sm font-medium ${!slide.text.trim() ? "rounded-xl border border-[#e4b966] bg-[#fff8e8] p-3 text-[#76581d]" : "text-[#514e57]"}`}>{!slide.text.trim() && <span className="mb-2 block text-xs font-semibold">This slide may need some context.</span>}What do you want to explain on this slide? <span className="font-normal text-[#89858e]">(optional)</span><textarea value={slide.context} onChange={e => updateSlide(slide.number, { context: e.target.value })} rows={2} placeholder="Add the point you want to make, especially if this slide is mostly visual." className="mt-2 block w-full resize-y rounded-lg border border-[#e3e0e5] bg-white px-3 py-2.5 font-normal text-[#24222b] placeholder:text-[#aaa7ad]"/></label>}</article>)}</div>
        {apiConfigured === false && <div className="mt-5 rounded-xl border border-[#e8d8b5] bg-[#fff9ec] p-4 text-sm leading-6 text-[#6e551f]"><strong>AI generation needs a quick setup.</strong> Add OPENAI_API_KEY to .env.local, then restart the dev server. Your PDF, previews and notes are ready to use in the meantime.</div>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><button onClick={() => { setStep(1); setError(""); }} className="flex items-center justify-center gap-1 rounded-xl px-4 py-3 text-sm font-semibold text-[#77747f] hover:bg-[#f0eef0]">{glyph("back", 17)} Change PDF</button><button onClick={() => void generate()} disabled={busy || !apiConfigured} className="flex items-center justify-center gap-2 rounded-xl bg-[#7055c8] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f46b1] disabled:cursor-not-allowed disabled:opacity-55">{busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"/>Finding your flow…</> : <>Write my script {glyph("spark", 16)}</>}</button></div>
      </>}

      {step === 3 && <>
        <div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[1.5px] text-[#7055c8]">You’ve got this</p><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-3xl font-semibold tracking-[-1px] sm:text-4xl">Your words, ready.</h1><p className="mt-2 text-sm text-[#77747f]">Read it through, make it yours, and take a breath.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void copy(scripts.map(s => `Slide ${s.number} — ${s.title}\n\n${s.script}`).join("\n\n"), "all")} className="flex items-center gap-2 rounded-xl border border-[#e1dde4] bg-white px-4 py-2.5 text-sm font-semibold">{glyph("copy", 16)} {copied === "all" ? "Copied!" : "Copy full speech"}</button><button onClick={download} className="flex items-center gap-2 rounded-xl bg-[#7055c8] px-4 py-2.5 text-sm font-semibold text-white">{glyph("download", 16)} Download .txt</button></div></div></div>
        <div className="mb-5 rounded-2xl border border-[#e9e6e2] bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">About {totalMinutes.toFixed(1)} min <span className="font-normal text-[#89858e]">estimated</span></p><p className="mt-1 text-xs text-[#89858e]">{totalWords.toLocaleString()} words · Speaking times estimated at 130 words per minute</p></div><span className="rounded-full bg-[#f0ecfb] px-3 py-1.5 text-xs font-semibold text-[#6550b3]">{scripts.length} slides</span></div><div className="h-2 overflow-hidden rounded-full bg-[#efedf1]"><div className="h-full rounded-full bg-[#8a73db] transition-all" style={{ width: `${percent}%` }}/></div><p className="mt-2 text-right text-xs text-[#89858e]">{prefs.duration} min target</p></div>
        <div className="space-y-4">{scripts.map(script => { const source = slides.find(s => s.number === script.number); return <article key={script.number} className="overflow-hidden rounded-2xl border border-[#e9e6e2] bg-white"><div className="flex items-center gap-4 border-b border-[#efedf0] px-5 py-4"><img src={source?.preview} alt={`Preview of slide ${script.number}`} className="h-14 w-[86px] rounded-lg border border-[#eeeaf0] object-contain"/><div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-wide text-[#7055c8]">Slide {script.number}</p><input value={script.title} onChange={e => updateScript(script.number, { title: e.target.value })} aria-label={`Slide ${script.number} title`} className="mt-0.5 w-full bg-transparent text-base font-semibold outline-none"/></div><span className="flex items-center gap-1.5 rounded-full bg-[#f5f3f0] px-2.5 py-1.5 text-xs text-[#68656c]">{glyph("clock", 14)} {timeLabel(script.script)} est.</span></div><div className="p-5"><label className="sr-only" htmlFor={`script-${script.number}`}>Speaking script for slide {script.number}</label><textarea id={`script-${script.number}`} value={script.script} onChange={e => updateScript(script.number, { script: e.target.value })} rows={Math.max(5, Math.min(15, Math.ceil(script.script.length / 92)))} className="w-full resize-y rounded-xl border border-[#efedf0] bg-[#fdfcfb] p-4 text-[15px] leading-7 text-[#38353d] focus:border-[#a89ae0]"/><div className="mt-3 flex items-center justify-between"><span className="text-xs text-[#89858e]">{words(script.script)} words · estimate</span><button onClick={() => void copy(script.script, `slide-${script.number}`)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[#6550b3] hover:bg-[#f2effb]">{glyph("copy", 14)} {copied === `slide-${script.number}` ? "Copied!" : "Copy this slide"}</button></div>{script.missingInfo.length > 0 && <div className="mt-3 rounded-xl border border-[#e8d8b5] bg-[#fff9ec] px-4 py-3"><p className="text-xs font-bold text-[#76581d]">Worth checking before you present</p><ul className="mt-1 list-inside list-disc text-sm leading-6 text-[#76581d]">{script.missingInfo.map((note,i) => <li key={i}>{note}</li>)}</ul></div>}</div></article>; })}</div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><button onClick={() => { setError(""); setStep(2); }} className="flex items-center justify-center gap-1 rounded-xl px-4 py-3 text-sm font-semibold text-[#77747f] hover:bg-[#f0eef0]">{glyph("back", 17)} Back to context & settings</button><button onClick={() => void generate()} disabled={busy} className="rounded-xl border border-[#dcd4f4] bg-[#f0ecfb] px-5 py-3 text-sm font-semibold text-[#6550b3] disabled:opacity-50">{busy ? "Generating…" : "Generate again"}</button></div>
      </>}
      {error && <div role="alert" className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-[#e6c8c3] bg-[#fff4f2] px-4 py-3 text-sm leading-6 text-[#8f3932]"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error" className="font-bold">×</button></div>}
      <footer className="mt-12 border-t border-[#e9e6e2] pt-5 text-center text-xs leading-5 text-[#99959d]">A good script is a starting point. Give it your voice.</footer>
    </section>
  </main>;
}
function Mini({ icon, title, body }: { icon: string; title: string; body: string }) { return <div className="flex items-start gap-3 rounded-2xl border border-[#efedf0] bg-white p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f0ecfb] text-[#7055c8]">{glyph(icon, 17)}</span><span><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs leading-5 text-[#89858e]">{body}</span></span></div>; }
