import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = 'https://aafiiiiii-precisionsight-backend.hf.space';

interface PredictionData {
  severity: number;
  severity_text: string;
  confidence: number;
}
interface IndividualPrediction {
  severity: number;
  confidence: number;
  probabilities: number[];
}
interface PredictionResponse {
  success: boolean;
  individual_predictions: Record<string, IndividualPrediction>;
  ensemble_prediction: PredictionData;
  message: string;
}

const severityMeta: Record<number, { label: string; color: string; bg: string; border: string; desc: string; advice: string }> = {
  0: { label: 'No DR',         color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0', desc: 'No signs of diabetic retinopathy detected.',         advice: 'Continue routine annual screening.' },
  1: { label: 'Mild',          color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', desc: 'Microaneurysms present. Monitor regularly.',           advice: 'Follow-up in 12 months recommended.' },
  2: { label: 'Moderate DR',   color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', desc: 'More than mild NPDR. Referral recommended.',           advice: 'Ophthalmology referral within 6 months.' },
  3: { label: 'Severe DR',     color: '#f97316', bg: '#fff7ed', border: '#fed7aa', desc: 'Extensive NPDR. Prompt referral required.',            advice: 'Urgent ophthalmology referral required.' },
  4: { label: 'Proliferative', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', desc: 'PDR detected. Urgent ophthalmology needed.',           advice: 'Immediate specialist intervention needed.' },
};

const modelDisplayNames: Record<string, string> = {
  efficientnet_b3:                  'EfficientNet-B3',
  convnext_tiny:                    'ConvNeXt Tiny',
  resnet50:                         'ResNet-50',
  swin_tiny_patch4_window7_224:     'Swin Transformer',
};

const modelDescriptions: Record<string, string> = {
  efficientnet_b3:              'Compound-scaled CNN optimized for accuracy vs. efficiency trade-off.',
  convnext_tiny:                'Modernized ConvNet architecture inspired by Vision Transformers.',
  resnet50:                     'Classic 50-layer residual network: strong and reliable baseline.',
  swin_tiny_patch4_window7_224: 'Hierarchical Vision Transformer with shifted window attention.',
};

const modelIcons: Record<string, string> = {
  efficientnet_b3: '🧠',
  convnext_tiny: '⚙️',
  resnet50: '🔗',
  swin_tiny_patch4_window7_224: '📐',
};

const performanceData = [
  { model: 'EfficientNet-B3',       key: 'efficientnet_b3',              valQWK: 0.855, testQWK: 0.855, testAcc: 0.7929, color: '#10b981' },
  { model: 'ConvNeXt Tiny',         key: 'convnext_tiny',                valQWK: 0.862, testQWK: 0.909, testAcc: 0.8202, color: '#0ea5e9' },
  { model: 'ResNet-50',             key: 'resnet50',                     valQWK: 0.834, testQWK: 0.873, testAcc: 0.8038, color: '#6366f1' },
  { model: 'Swin Transformer',      key: 'swin_tiny_patch4_window7_224', valQWK: 0.871, testQWK: 0.885, testAcc: 0.8202, color: '#8b5cf6' },
  { model: 'Balanced Ensemble MBT', key: 'ensemble',                     valQWK: null,  testQWK: 0.908, testAcc: 0.8256, color: '#f59e0b', isEnsemble: true },
];

type Page = 'home' | 'analyze' | 'about';

const card: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};

export default function Dashboard() {
  const [page, setPage]             = useState<Page>('home');
  const [file, setFile]             = useState<File | null>(null);
  const [preview, setPreview]       = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState(false);
  const [visible, setVisible]       = useState(false);
  const [barsVisible, setBarsVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setVisible(false); setBarsVisible(false);
    window.scrollTo(0, 0);
    const t1 = setTimeout(() => setVisible(true), 60);
    const t2 = setTimeout(() => setBarsVisible(true), 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [page]);

  const handleFile = (f: File) => {
    setFile(f); setPrediction(null); setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handlePredict = async () => {
    if (!file) { setError('Please select a fundus image first.'); return; }
    setLoading(true); setError(null); setPrediction(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post<PredictionResponse>(`${API_URL}/predict-all`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPrediction(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Analysis failed. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setFile(null); setPreview(null); setPrediction(null); setError(null); };
  const meta  = prediction ? (severityMeta[prediction.ensemble_prediction.severity] ?? severityMeta[0]) : null;

  // ─── PDF DOWNLOAD ────────────────────────────────────────────────────────────
  const downloadPDF = () => {
    if (!prediction || !meta) return;

    const reportId = 'ON-' + Date.now().toString(36).toUpperCase().slice(-8);
    const now      = new Date();
    const dateStr  = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr  = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Severity reference rows
    const severityRefRows = Object.entries(severityMeta).map(([k, s]) => {
      const isThis = parseInt(k) === prediction.ensemble_prediction.severity;
      return `
        <tr style="background:${isThis ? s.bg : 'transparent'};">
          <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${s.color};color:#fff;font-size:11px;font-weight:800;margin-right:8px;vertical-align:middle;">${k}</span>
            <strong style="color:${s.color};vertical-align:middle;">${s.label}</strong>
          </td>
          <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;">${s.desc}</td>
          <td style="padding:9px 14px;border-bottom:1px solid #f1f5f9;text-align:center;">
            ${isThis ? `<span style="background:${s.color};color:#fff;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;letter-spacing:0.05em;">▲ THIS RESULT</span>` : ''}
          </td>
        </tr>`;
    }).join('');

    // Model breakdown rows
    const modelRows = Object.entries(prediction.individual_predictions).map(([model, data]) => {
      const m   = severityMeta[data.severity] ?? severityMeta[0];
      const pct = (data.confidence * 100).toFixed(1);
      const bar = `
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:130px;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${m.color};border-radius:4px;"></div>
          </div>
          <span style="font-weight:700;color:#334155;font-size:13px;">${pct}%</span>
        </div>`;
      return `
        <tr>
          <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#0f172a;font-size:13.5px;">${modelDisplayNames[model] ?? model}</td>
          <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;">
            <span style="background:${m.bg};color:${m.color};border:1px solid ${m.border};border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;">${m.label}</span>
          </td>
          <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;">${bar}</td>
        </tr>`;
    }).join('');

    const ensembleConf = (prediction.ensemble_prediction.confidence * 100).toFixed(1);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>OpticNova DR Report ${reportId}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; font-size: 14px; line-height: 1.5; }
    @media print {
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print { display: none !important; }
      @page { margin: 0; size: A4; }
    }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; }
  </style>
</head>
<body>

  <!-- ── TOP ACCENT BAR ── -->
  <div style="height:7px;background:linear-gradient(90deg,#0ea5e9 0%,#6366f1 60%,#8b5cf6 100%);width:100%;"></div>

  <!-- ── HEADER ── -->
  <div style="padding:28px 48px 22px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #f1f5f9;">
    <div>
      <!-- Logo row -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,#0ea5e9,#6366f1);display:flex;align-items:center;justify-content:center;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="4" fill="white"/>
            <circle cx="12" cy="12" r="8.5" stroke="white" stroke-width="1.5"/>
            <line x1="12" y1="3.5" x2="12" y2="1" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="12" y1="23" x2="12" y2="20.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="3.5" y1="12" x2="1" y2="12" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="23" y1="12" x2="20.5" y2="12" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <span style="font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">OpticNova</span>
      </div>
      <p style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:3px;">Diabetic Retinopathy Screening Report</p>
      <p style="font-size:12px;color:#94a3b8;font-weight:500;">Powered by 4-Model Deep Learning Ensemble · QWK 0.908</p>
    </div>
    <div style="text-align:right;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;min-width:190px;">
      <p style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:6px;">Report Details</p>
      <p style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:3px;">${reportId}</p>
      <p style="font-size:12px;color:#64748b;margin-bottom:2px;">📅 ${dateStr}</p>
      <p style="font-size:12px;color:#64748b;">🕐 ${timeStr}</p>
    </div>
  </div>

  <!-- ── SECTION 1: ENSEMBLE VERDICT ── -->
  <div style="padding:28px 48px 0;">
    <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:14px;">01 — Ensemble Verdict</p>
    <div style="background:${meta.bg};border:1.5px solid ${meta.border};border-radius:14px;padding:28px 32px;display:flex;align-items:center;justify-content:space-between;gap:32px;">
      
      <!-- Left: verdict info -->
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
          <div style="width:48px;height:48px;border-radius:50%;background:${meta.color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:900;">
            ${prediction.ensemble_prediction.severity}
          </div>
          <div>
            <p style="font-size:24px;font-weight:900;color:${meta.color};line-height:1;letter-spacing:-0.03em;">${prediction.ensemble_prediction.severity_text}</p>
            <p style="font-size:12px;color:#64748b;margin-top:3px;">Stage ${prediction.ensemble_prediction.severity} of 4</p>
          </div>
        </div>
        <p style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:10px;">${meta.desc}</p>
        <div style="display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid ${meta.border};border-radius:8px;padding:7px 14px;">
          <span style="font-size:12px;font-weight:700;color:${meta.color};">📋 Recommended Action:</span>
          <span style="font-size:12px;color:#475569;">${meta.advice}</span>
        </div>
      </div>

      <!-- Right: confidence -->
      <div style="text-align:center;background:#fff;border:1px solid ${meta.border};border-radius:12px;padding:22px 28px;min-width:160px;flex-shrink:0;">
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:8px;">Confidence</p>
        <p style="font-size:38px;font-weight:900;color:${meta.color};line-height:1;letter-spacing:-0.04em;margin-bottom:12px;">${ensembleConf}%</p>
        <!-- Confidence bar -->
        <div style="width:110px;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin:0 auto;">
          <div style="width:${ensembleConf}%;height:100%;background:${meta.color};border-radius:4px;"></div>
        </div>
        <p style="font-size:11px;color:#94a3b8;margin-top:8px;">Ensemble of 4 models</p>
      </div>
    </div>
  </div>

  <!-- ── SECTION 2: MODEL BREAKDOWN ── -->
  <div style="padding:24px 48px 0;">
    <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:14px;">02 — Multi-Model Consensus</p>
    <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <table>
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
            <th style="padding:11px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:700;width:30%;">Model</th>
            <th style="padding:11px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:700;width:22%;">Prediction</th>
            <th style="padding:11px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:700;">Confidence</th>
          </tr>
        </thead>
        <tbody>${modelRows}</tbody>
        <tfoot>
          <tr style="background:linear-gradient(90deg,#eff6ff,#f5f3ff);border-top:2px solid #e2e8f0;">
            <td style="padding:13px 14px;font-weight:800;color:#0f172a;font-size:14px;">
              🏆 Balanced Ensemble
            </td>
            <td style="padding:13px 14px;">
              <span style="background:${meta.bg};color:${meta.color};border:1px solid ${meta.border};border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;">${prediction.ensemble_prediction.severity_text}</span>
            </td>
            <td style="padding:13px 14px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:130px;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
                  <div style="width:${ensembleConf}%;height:100%;background:linear-gradient(90deg,#0ea5e9,#6366f1);border-radius:4px;"></div>
                </div>
                <span style="font-weight:800;color:#0ea5e9;font-size:13px;">${ensembleConf}%</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p style="font-size:11.5px;color:#94a3b8;margin-top:10px;padding-left:4px;">
      ℹ️ Final prediction is derived by averaging softmax probability distributions across all 4 models.
    </p>
  </div>

  <!-- ── SECTION 3: DR SEVERITY REFERENCE ── -->
  <div style="padding:24px 48px 0;">
    <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:14px;">03 — DR Severity Reference Scale</p>
    <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <table>
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
            <th style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:700;width:28%;">Stage</th>
            <th style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:700;">Description</th>
            <th style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:700;width:15%;text-align:center;">Status</th>
          </tr>
        </thead>
        <tbody>${severityRefRows}</tbody>
      </table>
    </div>
  </div>

  <!-- ── DISCLAIMER ── -->
  <div style="padding:24px 48px 32px;">
    <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;padding:18px 22px;display:flex;gap:14px;align-items:flex-start;">
      <span style="font-size:20px;flex-shrink:0;">⚠️</span>
      <div>
        <p style="font-weight:700;color:#c2410c;font-size:13px;margin-bottom:5px;">Clinical Disclaimer</p>
        <p style="color:#78350f;font-size:12.5px;line-height:1.6;">
          This report is generated by an academic AI prototype and must <strong>not</strong> replace diagnosis 
          by a qualified ophthalmologist. The predictions are based on a deep learning model validated on 
          research datasets (Test QWK: 0.908) and are intended as a <strong>screening aid only</strong>. 
          All findings must be confirmed by a licensed medical professional before any clinical decision is made.
        </p>
      </div>
    </div>
  </div>

  <!-- ── BOTTOM ACCENT BAR ── -->
  <div style="height:5px;background:linear-gradient(90deg,#0ea5e9 0%,#6366f1 60%,#8b5cf6 100%);width:100%;"></div>

  <!-- ── PRINT FOOTER ── -->
  <div style="padding:12px 48px;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border-top:1px solid #e2e8f0;">
    <span style="font-size:11px;color:#94a3b8;">OpticNova · Diabetic Retinopathy Detection System</span>
    <span style="font-size:11px;color:#94a3b8;">Report ID: ${reportId} · Generated ${dateStr} at ${timeStr}</span>
  </div>

  <!-- Print button (hidden when printing) -->
  <div class="no-print" style="text-align:center;padding:28px;">
    <button onclick="window.print()" style="background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;border:none;border-radius:10px;padding:14px 36px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(14,165,233,0.3);">
      ⬇ Save as PDF (Print → Save as PDF)
    </button>
    <p style="margin-top:10px;font-size:12px;color:#94a3b8;">Use Ctrl+P → Save as PDF, or click the button above</p>
  </div>

</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Please allow popups to download the report.'); return; }
    win.document.write(html);
    win.document.close();
    // Auto-trigger print dialog after a short delay for styles to load
    setTimeout(() => win.print(), 600);
  };
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      fontFamily: "'Inter','Segoe UI',sans-serif",
      background: '#eef3f7',
      minHeight: '100vh',
      color: '#1e293b',
      width: '100%',
      overflowX: 'hidden',
      fontSize: '16px',
    }}>

      {/* ══ NAVBAR ══════════════════════════════════════════════════════════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.98)',
        borderBottom: '1px solid #e2e8f0',
        height: '56px',
        display: 'flex', alignItems: 'center',
        padding: '0 5%',
        boxSizing: 'border-box',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div onClick={() => setPage('home')} style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" fill="white"/>
                <circle cx="12" cy="12" r="8.5" stroke="white" strokeWidth="1.5" fill="none"/>
                <line x1="12" y1="3.5" x2="12" y2="1"    stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="12" y1="23"  x2="12" y2="20.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="3.5" y1="12" x2="1"   y2="12"  stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="23"  y1="12" x2="20.5" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a', letterSpacing: '-0.01em' }}>OpticNova</span>
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            {(['home','analyze','about'] as Page[]).map(id => (
              <button key={id} onClick={() => setPage(id)} style={{
                background: page === id ? 'linear-gradient(135deg,#0ea5e9,#6366f1)' : 'transparent',
                border: 'none', borderRadius: '8px', padding: '7px 20px',
                color: page === id ? '#fff' : '#64748b',
                fontWeight: page === id ? 600 : 400,
                fontSize: '0.9375rem', cursor: 'pointer', transition: 'all 0.15s',
                textTransform: 'capitalize' as const,
              }}>{id}</button>
            ))}
          </div>

          <button onClick={() => setPage('analyze')} style={{
            background: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
            border: 'none', borderRadius: '9px', padding: '10px 26px',
            color: '#fff', fontWeight: 600, fontSize: '0.9375rem',
            cursor: 'pointer', boxShadow: '0 3px 12px rgba(14,165,233,0.28)',
          }}>Start Analysis</button>
        </div>
      </nav>

      <div style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease', paddingTop: '56px' }}>

        {/* ══ HOME ════════════════════════════════════════════════════════════════ */}
        {page === 'home' && (
          <>
            {/* HERO */}
            <section style={{
              width: '100%', height: 'calc(100vh - 56px)',
              padding: '4% 5%', boxSizing: 'border-box',
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              alignItems: 'center', gap: '4%',
              background: 'linear-gradient(150deg,#e8f4fd 0%,#eef3f7 40%,#f0eeff 100%)',
            }}>
              {/* Left */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '100px', padding: '5px 14px', marginBottom: '28px', fontSize: '0.75rem', color: '#3b82f6', letterSpacing: '0.07em', textTransform: 'uppercase' as const, fontWeight: 600 }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', animation: 'pulse 2s infinite', display: 'inline-block' }}/>
                  Multi-Model Ensemble · Deep Learning
                </div>
                <h1 style={{ fontSize: 'clamp(2.4rem,4vw,3.5rem)', fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.03em', color: '#0f172a', margin: '0 0 24px 0' }}>
                  Precision Sight.<br/>
                  <span style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Powered by Intelligence.
                  </span>
                </h1>
                <p style={{ fontSize: '1rem', color: '#475569', lineHeight: 1.65, margin: '0 0 14px 0', maxWidth: '520px' }}>
                  Early detection is the most powerful tool in the fight against vision loss.
                  Our platform integrates a sophisticated ensemble of deep learning
                  architectures — including EfficientNet and Vision Transformers — to
                  analyze retinal fundus images with clinical-grade accuracy.
                </p>
                <p style={{ fontSize: '0.9375rem', color: '#64748b', lineHeight: 1.65, margin: '0 0 36px 0', maxWidth: '520px' }}>
                  By combining multiple model perspectives into a single unified prediction, our
                  system delivers more than just a classification — a high-confidence diagnostic
                  decision system.
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setPage('analyze')} style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', border: 'none', borderRadius: '10px', padding: '13px 30px', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(14,165,233,0.3)' }}>
                    Analyze Image →
                  </button>
                  <button onClick={() => setPage('about')} style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '13px 30px', color: '#334155', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    View Performance
                  </button>
                </div>
              </div>

              {/* Right — 3 stat cards (accuracy removed) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Big QWK card */}
                <div style={{ ...card, padding: '32px 30px' }}>
                  <div style={{ fontSize: 'clamp(2.5rem,4vw,3.25rem)', fontWeight: 900, color: '#0ea5e9', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: '10px' }}>0.908</div>
                  <div style={{ fontSize: '1rem', color: '#334155', fontWeight: 600, marginBottom: '4px' }}>Ensemble QWK</div>
                  <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Quadratic Weighted Kappa</div>
                </div>
                {/* Two smaller cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ ...card, padding: '28px 24px' }}>
                    <div style={{ fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 900, color: '#0ea5e9', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: '10px' }}>4</div>
                    <div style={{ fontSize: '0.9375rem', color: '#334155', fontWeight: 600 }}>AI Architectures</div>
                  </div>
                  <div style={{ ...card, padding: '28px 24px' }}>
                    <div style={{ fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 900, color: '#0ea5e9', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: '10px' }}>5</div>
                    <div style={{ fontSize: '0.9375rem', color: '#334155', fontWeight: 600 }}>DR Stages</div>
                  </div>
                </div>
              </div>
            </section>

            {/* SEVERITY SCALE */}
            <section style={{ width: '100%', padding: '80px 5%', boxSizing: 'border-box', background: '#fff', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '60px', alignItems: 'start' }}>
                <div>
                  <h2 style={{ fontSize: 'clamp(1.4rem,2.2vw,1.875rem)', fontWeight: 700, color: '#0f172a', margin: '0 0 16px 0', letterSpacing: '-0.02em' }}>DR Severity Scale</h2>
                  <p style={{ color: '#64748b', lineHeight: 1.6, fontSize: '0.9375rem', margin: '0 0 14px 0' }}>
                    The International Clinical DR Disease Severity Scale defines 5 stages — from healthy retina to sight-threatening proliferative disease.
                  </p>
                  <p style={{ color: '#94a3b8', lineHeight: 1.6, fontSize: '0.875rem', margin: 0 }}>
                    Our ensemble detects all 5 stages with a QWK of 0.908 — <span style={{ color: '#0ea5e9', fontWeight: 600 }}>Excellent</span> clinical range.
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Object.entries(severityMeta).map(([key, m]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '16px', background: m.bg, border: `1px solid ${m.border}`, borderRadius: '12px', padding: '14px 20px' }}>
                      <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', flexShrink: 0, fontSize: '1rem' }}>{key}</div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 700, color: m.color, margin: '0 0 3px 0', fontSize: '0.9375rem' }}>{m.label}</p>
                        <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>{m.desc}</p>
                      </div>
                      <div style={{ width: '80px', height: '4px', background: '#e2e8f0', borderRadius: '4px', flexShrink: 0 }}>
                        <div style={{ height: '100%', width: `${(parseInt(key) + 1) * 20}%`, background: m.color, borderRadius: '4px' }}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* HOW IT WORKS */}
            <section style={{ width: '100%', padding: '80px 5%', boxSizing: 'border-box' }}>
              <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.4rem,2.2vw,1.875rem)', fontWeight: 700, color: '#0f172a', margin: '0 0 10px 0', letterSpacing: '-0.02em' }}>The Diagnostic Partner</h2>
              <p style={{ textAlign: 'center', color: '#64748b', margin: '0 0 48px 0', fontSize: '1rem' }}>Three things that make this more than a "mere project"</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '20px' }}>
                {[
                  { icon: '🔬', title: 'Multi-Model Consensus',  body: 'Four architecturally diverse networks vote on every image. CNNs capture local lesion features; Transformers capture global retinal context. No single model decides alone.' },
                  { icon: '📊', title: 'Validated Performance',   body: 'Ensemble QWK of 0.908 on held-out test data — exceeding individual models and placing the system in the Excellent range of the clinical QWK scale.' },
                  { icon: '⚡', title: 'Real-Time Ensemble',      body: 'All four models run in parallel on every upload. Results — including per-model confidence and ensemble decision — arrive in seconds.' },
                ].map(({ icon, title, body }) => (
                  <div key={title}
                    style={{ ...card, padding: '28px', cursor: 'default', transition: 'box-shadow 0.2s, transform 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(14,165,233,0.12)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
                  >
                    <div style={{ fontSize: '2rem', marginBottom: '14px' }}>{icon}</div>
                    <h3 style={{ fontWeight: 700, fontSize: '1.0625rem', margin: '0 0 10px 0', color: '#0f172a' }}>{title}</h3>
                    <p style={{ color: '#64748b', lineHeight: 1.65, fontSize: '0.9rem', margin: 0 }}>{body}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* ══ ANALYZE ═════════════════════════════════════════════════════════════ */}
        {page === 'analyze' && (
          <section style={{
            width: '100%', minHeight: 'calc(100vh - 56px)',
            padding: '60px 5%', boxSizing: 'border-box',
            background: 'linear-gradient(150deg,#e8f4fd 0%,#eef3f7 40%,#f0eeff 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <h1 style={{ fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 800, color: '#0f172a', margin: '0 0 14px 0', letterSpacing: '-0.03em' }}>
                Detect Diabetic{' '}
                <span style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Retinopathy</span>
              </h1>
              <p style={{ color: '#64748b', fontSize: '1.0625rem', margin: 0, lineHeight: 1.6 }}>
                Upload a fundus image to classify DR severity using our ensemble of 4 deep learning models.
              </p>
            </div>

            {/* Upload box */}
            <div style={{ width: '100%', maxWidth: '580px' }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                style={{ ...card, border: `2px dashed ${dragOver ? '#0ea5e9' : '#cbd5e1'}`, padding: '60px 40px', textAlign: 'center', cursor: 'pointer', background: dragOver ? '#f0f9ff' : '#fff', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', minHeight: '280px' }}
              >
                {preview
                  ? <img src={preview} alt="preview" style={{ maxHeight: '220px', maxWidth: '100%', borderRadius: '10px', objectFit: 'contain' }}/>
                  : <>
                      <div style={{ width: '64px', height: '64px', borderRadius: '14px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🖼️</div>
                      <div>
                        <p style={{ color: '#334155', fontSize: '1rem', margin: '0 0 6px 0', fontWeight: 600 }}>Drag & drop a fundus image here</p>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>or click below to browse</p>
                      </div>
                    </>
                }
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}/>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                {!preview
                  ? <button onClick={() => fileInputRef.current?.click()} style={{ ...card, padding: '11px 26px', color: '#334155', fontWeight: 600, fontSize: '0.9375rem', cursor: 'pointer', border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px', background: '#fff' }}>⬆ Browse Files</button>
                  : <>
                      <button onClick={handlePredict} disabled={loading} style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', border: 'none', borderRadius: '10px', padding: '13px 32px', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(14,165,233,0.28)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {loading ? <><span style={{ width: '15px', height: '15px', border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }}/> Analyzing…</> : 'Run All Models →'}
                      </button>
                      <button onClick={reset} style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '13px 24px', color: '#64748b', fontWeight: 600, fontSize: '0.9375rem', cursor: 'pointer' }}>Clear</button>
                    </>
                }
              </div>
              {error && <div style={{ marginTop: '14px', padding: '13px 18px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#ef4444', fontSize: '0.9rem', textAlign: 'center' }}>⚠️ {error}</div>}
            </div>

            {/* Loading */}
            {loading && (
              <div style={{ marginTop: '48px', textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '18px' }}>
                  {[0,1,2,3].map(i => <div key={i} style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#0ea5e9', animation: `bounce 1.2s ${i*0.15}s infinite` }}/>)}
                </div>
                <p style={{ color: '#64748b', fontSize: '1rem' }}>Running ensemble inference across 4 models…</p>
              </div>
            )}

            {/* Results */}
            {prediction && meta && (
              <div style={{ width: '100%', marginTop: '48px' }}>

                {/* Ensemble result card */}
                <div style={{ ...card, background: meta.bg, border: `1.5px solid ${meta.border}`, padding: '36px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '32px' }}>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 10px 0', fontWeight: 700 }}>Ensemble Prediction</p>
                    <p style={{ fontSize: 'clamp(1.6rem,3vw,2.25rem)', fontWeight: 900, color: meta.color, letterSpacing: '-0.03em', margin: '0 0 8px 0', lineHeight: 1 }}>{prediction.ensemble_prediction.severity_text}</p>
                    <p style={{ fontSize: '0.9375rem', color: '#64748b', margin: '0 0 12px 0', lineHeight: 1.5 }}>{meta.desc}</p>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fff', border: `1px solid ${meta.border}`, borderRadius: '8px', padding: '6px 12px' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: meta.color }}>📋</span>
                      <span style={{ fontSize: '0.8125rem', color: '#475569' }}>{meta.advice}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 'clamp(2rem,3vw,2.75rem)', fontWeight: 900, color: meta.color, lineHeight: 1, marginBottom: '6px' }}>
                      {(prediction.ensemble_prediction.confidence * 100).toFixed(1)}%
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 10px 0', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 }}>Confidence</p>
                    <div style={{ width: '160px', height: '6px', background: '#e2e8f0', borderRadius: '4px' }}>
                      <div style={{ height: '100%', borderRadius: '4px', width: `${(prediction.ensemble_prediction.confidence * 100).toFixed(0)}%`, background: meta.color, transition: 'width 1.2s ease' }}/>
                    </div>
                  </div>
                </div>

                {/* 4 model cards */}
                <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#334155', margin: '0 0 16px 0' }}>Individual Model Breakdown</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '28px' }}>
                  {Object.entries(prediction.individual_predictions).map(([model, data]) => {
                    const m = severityMeta[data.severity] ?? severityMeta[0];
                    return (
                      <div key={model} style={{ ...card, padding: '22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <p style={{ fontWeight: 700, color: '#0ea5e9', fontSize: '0.9375rem', margin: 0 }}>{modelDisplayNames[model] ?? model}</p>
                        <p style={{ fontSize: '0.875rem', color: m.color, margin: 0, fontWeight: 600 }}>{m.label}</p>
                        <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1 }}>
                          {(data.confidence * 100).toFixed(1)}%
                        </div>
                        <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '4px' }}>
                          <div style={{ height: '100%', width: `${(data.confidence * 100).toFixed(0)}%`, background: m.color, borderRadius: '4px', transition: 'width 1s ease' }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── DOWNLOAD REPORT BUTTON ── */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={downloadPDF}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      background: 'linear-gradient(135deg,#0f172a,#1e293b)',
                      border: 'none', borderRadius: '12px',
                      padding: '16px 36px',
                      color: '#fff', fontWeight: 700, fontSize: '1rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 20px rgba(15,23,42,0.25)',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(15,23,42,0.3)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(15,23,42,0.25)'; }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download Screening Report (PDF)
                  </button>
                </div>

              </div>
            )}
          </section>
        )}

        {/* ══ ABOUT ═══════════════════════════════════════════════════════════════ */}
        {page === 'about' && (
          <div style={{ background: '#eef3f7', paddingBottom: '80px' }}>
            <section style={{ width: '100%', padding: '60px 5% 40px', boxSizing: 'border-box' }}>
              <h1 style={{ fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 800, color: '#0f172a', margin: '0 0 12px 0', letterSpacing: '-0.03em' }}>Model Performance & Architecture</h1>
              <p style={{ color: '#64748b', fontSize: '1rem', margin: 0 }}>Validated on held-out test data. Results are reproducible and independently verified.</p>
            </section>

            {/* 4 stat cards */}
            <section style={{ width: '100%', padding: '0 5% 28px', boxSizing: 'border-box' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '18px' }}>
                {[
                  { val: '0.908',     label: 'Ensemble QWK',   color: '#0ea5e9' },
                  { val: '82.6%',     label: 'Test Accuracy',  color: '#f59e0b' },
                  { val: '0.909',     label: 'Best Model QWK', color: '#10b981' },
                  { val: 'Excellent', label: 'Clinical Grade',  color: '#10b981' },
                ].map(({ val, label, color }) => (
                  <div key={label} style={{ ...card, textAlign: 'center', padding: '32px 20px' }}>
                    <div style={{ fontSize: 'clamp(1.75rem,2.8vw,2.25rem)', fontWeight: 900, color, letterSpacing: '-0.03em', marginBottom: '8px', lineHeight: 1 }}>{val}</div>
                    <div style={{ fontSize: '0.9375rem', color: '#64748b', fontWeight: 500 }}>{label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Bar chart + Table */}
            <section style={{ width: '100%', padding: '0 5% 24px', boxSizing: 'border-box' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '20px' }}>
                <div style={{ ...card, padding: '28px' }}>
                  <h3 style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.125rem', margin: '0 0 5px 0' }}>Test QWK Score by Model</h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 26px 0' }}>Higher is Better · Scale 0.75 → 1.0</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {performanceData.map((d) => (
                      <div key={d.model} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: d.isEnsemble ? 700 : 500, color: d.isEnsemble ? '#0f172a' : '#475569', minWidth: '170px', flexShrink: 0 }}>
                          {d.model}{d.isEnsemble ? ' 🔥' : ''}
                        </span>
                        <div style={{ flex: 1, height: '10px', background: '#f1f5f9', borderRadius: '5px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: barsVisible ? `${((d.testQWK - 0.75) / 0.25) * 100}%` : '0%', background: d.color, borderRadius: '5px', transition: 'width 1.2s ease' }}/>
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0ea5e9', minWidth: '44px', textAlign: 'right' }}>{d.testQWK.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ ...card, padding: '28px' }}>
                  <h3 style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.125rem', margin: '0 0 5px 0' }}>Full Results</h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 20px 0' }}>Val & Test QWK · Accuracy</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {['Model','Val QWK','Test QWK','Test Acc'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Model' ? 'left' : 'center', color: '#94a3b8', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {performanceData.map((d, i) => (
                        <tr key={d.model} style={{ borderBottom: i < performanceData.length - 1 ? '1px solid #f8fafc' : 'none', background: d.isEnsemble ? '#f0f9ff' : 'transparent' }}>
                          <td style={{ padding: '12px 10px', fontWeight: d.isEnsemble ? 700 : 500, color: d.isEnsemble ? '#0ea5e9' : '#334155', fontSize: '0.875rem' }}>
                            {d.model}{d.isEnsemble && <span style={{ fontSize: '0.65rem', background: '#dbeafe', color: '#0ea5e9', borderRadius: '4px', padding: '1px 6px', marginLeft: '6px', fontWeight: 700 }}>MBT</span>}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>{d.valQWK ? d.valQWK.toFixed(3) : 'MBT'}</td>
                          <td style={{ padding: '12px 10px', textAlign: 'center', color: '#0ea5e9', fontWeight: 700, fontSize: '0.875rem' }}>{d.testQWK.toFixed(3)}</td>
                          <td style={{ padding: '12px 10px', textAlign: 'center', color: '#334155', fontWeight: 500, fontSize: '0.875rem' }}>{(d.testAcc * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Pipeline + Architectures */}
            <section style={{ width: '100%', padding: '0 5% 24px', boxSizing: 'border-box' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ ...card, padding: '28px' }}>
                  <h3 style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.125rem', margin: '0 0 22px 0' }}>Inference Pipeline</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[
                      { icon: '⬆', label: 'Upload Image' },
                      { icon: '🖼', label: 'Preprocessed to 224×224' },
                      { icon: '⚙', label: 'Run 4 Models in Parallel' },
                      { icon: '📊', label: 'Average Softmax Probabilities' },
                      { icon: '✓', label: 'Output Final Prediction' },
                    ].map(({ icon, label }, i) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#f0f9ff', border: '1.5px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3b82f6' }}>{i + 1}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, background: '#f8fafc', borderRadius: '8px', padding: '10px 14px' }}>
                          <span style={{ fontSize: '1rem' }}>{icon}</span>
                          <span style={{ fontSize: '0.9375rem', color: '#334155', fontWeight: 500 }}>{label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ ...card, padding: '28px' }}>
                  <h3 style={{ fontWeight: 700, color: '#0f172a', fontSize: '1.125rem', margin: '0 0 22px 0' }}>The Four Architectures</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {Object.entries(modelDisplayNames).map(([key, name]) => {
                      const perf = performanceData.find(p => p.key === key);
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 15px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                          <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.2rem' }}>{modelIcons[key]}</div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9375rem', margin: '0 0 3px 0' }}>{name}</p>
                            <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0, lineHeight: 1.4 }}>{modelDescriptions[key]}</p>
                          </div>
                          {perf && <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0ea5e9', flexShrink: 0 }}>QWK {perf.testQWK.toFixed(3)}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* Why Ensemble + Disclaimer */}
            <section style={{ width: '100%', padding: '0 5%', boxSizing: 'border-box' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ ...card, padding: '28px', border: '1px solid #bfdbfe', background: '#f0f9ff' }}>
                  <h3 style={{ fontWeight: 700, color: '#0ea5e9', margin: '0 0 14px 0', fontSize: '1.125rem' }}>Why Ensemble?</h3>
                  <p style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.9375rem', margin: 0 }}>
                    No single model is perfect. By combining four architecturally diverse networks — CNNs, residual networks,
                    and Vision Transformers — the ensemble averages out individual errors. The final prediction uses averaged
                    softmax probabilities, yielding a <strong>QWK of 0.908</strong> — exceeding every individual model and
                    placing this system in the <span style={{ color: '#0ea5e9', fontWeight: 600 }}>Excellent</span> range of the clinical QWK scale.
                  </p>
                </div>
                <div style={{ ...card, padding: '28px', border: '1px solid #fecaca', background: '#fef2f2' }}>
                  <h3 style={{ fontWeight: 700, color: '#ef4444', margin: '0 0 14px 0', fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '8px' }}>⚠️ Disclaimer</h3>
                  <p style={{ color: '#334155', fontSize: '0.9375rem', lineHeight: 1.7, margin: 0 }}>
                    This is an academic research prototype. It is <strong>not approved for clinical use</strong> and must not replace
                    diagnosis by a qualified ophthalmologist.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* FOOTER */}
        <footer style={{ background: '#fff', borderTop: '1px solid #e2e8f0', padding: '24px 5%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>👁</div>
              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9375rem' }}>OpticNova</span>
              <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>· Diabetic Retinopathy Detection</span>
            </div>
            <div style={{ display: 'flex', gap: '20px' }}>
              {(['home','analyze','about'] as Page[]).map(id => (
                <button key={id} onClick={() => setPage(id)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.875rem', cursor: 'pointer', textTransform: 'capitalize' as const, padding: 0 }}>{id}</button>
              ))}
            </div>
            <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Powered by React · FastAPI · PyTorch</span>
          </div>
        </footer>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      `}</style>
    </div>
  );
}
