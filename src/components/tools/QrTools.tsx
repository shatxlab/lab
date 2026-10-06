import * as React from "react";
import { Camera, CameraOff, Download } from "lucide-react";

import {
  ActionButton,
  CopyButton,
  FilePicker,
  SelectField,
  Tabs,
  ToolPage,
  inputClass,
  labelClass,
  panelClass,
  textareaClass,
} from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { saveBlob } from "@/lib/apps/file-open";
import { useAppLang } from "@/lib/apps/use-app-lang";
import {
  buildMatrix,
  DEFAULT_QR_STYLE,
  drawMatrix,
  matrixToSvg,
  QrTooLongError,
  styleWarning,
  type ErrorCorrection,
  type QrMatrix,
  type QrStyle,
} from "@/lib/qr/generate";
import { tq } from "@/lib/qr/i18n";
import {
  contactPayload,
  emailPayload,
  locationPayload,
  parseScanResult,
  phonePayload,
  smsPayload,
  wifiPayload,
  type PayloadKind,
  type ScanResult,
  type WifiSecurity,
} from "@/lib/qr/payload";
import { decodeFrame, decodeImageFile } from "@/lib/qr/scan";
import { cn } from "@/lib/viewer/utils";

type TabId = "create" | "scan";

export default function QrTools() {
  const lang = useAppLang();
  const [tab, setTab] = React.useState<TabId>("create");
  /** Text handed from the scanner to the generator ("create a code from this"). */
  const [seed, setSeed] = React.useState<string | null>(null);

  return (
    <ToolPage title={tq(lang, "title")} tagline={tq(lang, "tagline")} wide>
      <Tabs
        idPrefix="qr-tools"
        label={tq(lang, "tabs")}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "create", label: tq(lang, "tabCreate") },
          { id: "scan", label: tq(lang, "tabScan") },
        ]}
      />
      <div role="tabpanel" id={`qr-tools-panel-${tab}`} aria-labelledby={`qr-tools-tab-${tab}`} className="flex flex-col gap-4">
        {tab === "create" && <CreateTab lang={lang} seed={seed} />}
        {tab === "scan" && (
          <ScanTab
            lang={lang}
            onUse={(text) => {
              setSeed(text);
              setTab("create");
            }}
          />
        )}
      </div>
    </ToolPage>
  );
}

/* ---------------------------------------------------------------- create */

function Field({ label, value, onChange, type = "text", ...rest }: { label: string; value: string; onChange: (value: string) => void; type?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type">) {
  return (
    <label className={labelClass}>
      {label}
      <input className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" {...rest} />
    </label>
  );
}

function CreateTab({ lang, seed }: { lang: AppLang; seed: string | null }) {
  const [kind, setKind] = React.useState<PayloadKind>("text");
  const [text, setText] = React.useState("");
  const [wifi, setWifi] = React.useState({ ssid: "", password: "", security: "WPA" as WifiSecurity, hidden: false });
  const [email, setEmail] = React.useState({ to: "", subject: "", body: "" });
  const [phone, setPhone] = React.useState("");
  const [sms, setSms] = React.useState({ number: "", message: "" });
  const [contact, setContact] = React.useState({ firstName: "", lastName: "", organization: "", phone: "", email: "", url: "" });
  const [location, setLocation] = React.useState({ latitude: "", longitude: "" });
  const [style, setStyle] = React.useState<QrStyle>(DEFAULT_QR_STYLE);
  const [size, setSize] = React.useState(512);
  const [copyState, setCopyState] = React.useState<"idle" | "ok" | "failed">("idle");
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (seed !== null) {
      setKind("text");
      setText(seed);
    }
  }, [seed]);

  const payload = React.useMemo(() => {
    switch (kind) {
      case "text":
        return text;
      case "wifi":
        return wifi.ssid ? wifiPayload(wifi) : "";
      case "email":
        return email.to ? emailPayload(email) : "";
      case "phone":
        return phone.replace(/[^\d+]/g, "") ? phonePayload(phone) : "";
      case "sms":
        return sms.number.replace(/[^\d+]/g, "") ? smsPayload(sms.number, sms.message) : "";
      case "contact":
        return contact.firstName || contact.lastName || contact.organization ? contactPayload(contact) : "";
      case "location":
        return Number.isFinite(Number.parseFloat(location.latitude)) && Number.isFinite(Number.parseFloat(location.longitude))
          ? locationPayload(location.latitude, location.longitude)
          : "";
    }
  }, [kind, text, wifi, email, phone, sms, contact, location]);

  const deferredPayload = React.useDeferredValue(payload);
  const built = React.useMemo<{ matrix: QrMatrix } | { error: "tooLong" | "other"; message?: string } | null>(() => {
    if (deferredPayload === "") return null;
    try {
      return { matrix: buildMatrix(deferredPayload, style.errorCorrection) };
    } catch (error) {
      return error instanceof QrTooLongError ? { error: "tooLong" } : { error: "other", message: error instanceof Error ? error.message : String(error) };
    }
  }, [deferredPayload, style.errorCorrection]);

  const matrix = built && "matrix" in built ? built.matrix : null;

  React.useEffect(() => {
    if (canvasRef.current && matrix) drawMatrix(canvasRef.current, matrix, style, size);
  }, [matrix, style, size]);

  const warning = styleWarning(style);

  const downloadPng = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) saveBlob(blob, "qr-code.png");
    }, "image/png");
  };

  const downloadSvg = () => {
    if (matrix) saveBlob(new Blob([matrixToSvg(matrix, style, size)], { type: "image/svg+xml" }), "qr-code.svg");
  };

  const copyImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      setCopyState("failed");
      return;
    }
    canvas.toBlob(async (blob) => {
      try {
        if (!blob) throw new Error("no blob");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopyState("ok");
      } catch {
        setCopyState("failed");
      }
      window.setTimeout(() => setCopyState("idle"), 1800);
    }, "image/png");
  };

  const typeLabels: Record<PayloadKind, string> = {
    text: tq(lang, "typeText"),
    wifi: tq(lang, "typeWifi"),
    email: tq(lang, "typeEmail"),
    phone: tq(lang, "typePhone"),
    sms: tq(lang, "typeSms"),
    contact: tq(lang, "typeContact"),
    location: tq(lang, "typeLocation"),
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex min-w-0 flex-col gap-4">
        <SelectField
          label={tq(lang, "type")}
          value={kind}
          onChange={(value) => setKind(value as PayloadKind)}
          options={(Object.keys(typeLabels) as PayloadKind[]).map((value) => ({ value, label: typeLabels[value] }))}
        />

        {kind === "text" && (
          <label className={labelClass}>
            {tq(lang, "text")}
            <textarea className={cn(textareaClass, "min-h-32")} value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
          </label>
        )}
        {kind === "wifi" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tq(lang, "ssid")} value={wifi.ssid} onChange={(ssid) => setWifi({ ...wifi, ssid })} />
            {wifi.security !== "nopass" && <Field label={tq(lang, "password")} value={wifi.password} onChange={(password) => setWifi({ ...wifi, password })} />}
            <SelectField
              label={tq(lang, "security")}
              value={wifi.security}
              onChange={(security) => setWifi({ ...wifi, security: security as WifiSecurity })}
              options={[
                { value: "WPA", label: tq(lang, "secWpa") },
                { value: "WEP", label: tq(lang, "secWep") },
                { value: "nopass", label: tq(lang, "secNone") },
              ]}
            />
            <label className="flex items-center gap-2 text-sm sm:self-end sm:pb-2">
              <input type="checkbox" checked={wifi.hidden} onChange={(event) => setWifi({ ...wifi, hidden: event.target.checked })} />
              {tq(lang, "hidden")}
            </label>
          </div>
        )}
        {kind === "email" && (
          <div className="grid gap-3">
            <Field label={tq(lang, "emailTo")} type="email" value={email.to} onChange={(to) => setEmail({ ...email, to })} />
            <Field label={tq(lang, "emailSubject")} value={email.subject} onChange={(subject) => setEmail({ ...email, subject })} />
            <label className={labelClass}>
              {tq(lang, "emailBody")}
              <textarea className={cn(textareaClass, "min-h-24 font-sans")} value={email.body} onChange={(event) => setEmail({ ...email, body: event.target.value })} />
            </label>
          </div>
        )}
        {kind === "phone" && <Field label={tq(lang, "phone")} type="tel" value={phone} onChange={setPhone} />}
        {kind === "sms" && (
          <div className="grid gap-3">
            <Field label={tq(lang, "smsNumber")} type="tel" value={sms.number} onChange={(number) => setSms({ ...sms, number })} />
            <label className={labelClass}>
              {tq(lang, "smsMessage")}
              <textarea className={cn(textareaClass, "min-h-24 font-sans")} value={sms.message} onChange={(event) => setSms({ ...sms, message: event.target.value })} />
            </label>
          </div>
        )}
        {kind === "contact" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tq(lang, "firstName")} value={contact.firstName} onChange={(firstName) => setContact({ ...contact, firstName })} />
            <Field label={tq(lang, "lastName")} value={contact.lastName} onChange={(lastName) => setContact({ ...contact, lastName })} />
            <Field label={tq(lang, "organization")} value={contact.organization} onChange={(organization) => setContact({ ...contact, organization })} />
            <Field label={tq(lang, "contactPhone")} type="tel" value={contact.phone} onChange={(phone) => setContact({ ...contact, phone })} />
            <Field label={tq(lang, "contactEmail")} type="email" value={contact.email} onChange={(email) => setContact({ ...contact, email })} />
            <Field label={tq(lang, "contactUrl")} type="url" value={contact.url} onChange={(url) => setContact({ ...contact, url })} />
          </div>
        )}
        {kind === "location" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tq(lang, "latitude")} inputMode="decimal" value={location.latitude} onChange={(latitude) => setLocation({ ...location, latitude })} placeholder="55.7558" />
            <Field label={tq(lang, "longitude")} inputMode="decimal" value={location.longitude} onChange={(longitude) => setLocation({ ...location, longitude })} placeholder="37.6173" />
          </div>
        )}

        <fieldset className={cn(panelClass, "grid gap-3 sm:grid-cols-2")}>
          <legend className="px-1 text-sm font-semibold">{tq(lang, "appearance")}</legend>
          <SelectField
            label={tq(lang, "correction")}
            value={style.errorCorrection}
            onChange={(value) => setStyle({ ...style, errorCorrection: value as ErrorCorrection })}
            options={[
              { value: "L", label: tq(lang, "corrL") },
              { value: "M", label: tq(lang, "corrM") },
              { value: "Q", label: tq(lang, "corrQ") },
              { value: "H", label: tq(lang, "corrH") },
            ]}
          />
          <label className={labelClass}>
            {tq(lang, "size", { size })}
            <input type="range" min={128} max={1024} step={32} value={size} onChange={(event) => setSize(Number(event.target.value))} />
          </label>
          <label className={labelClass}>
            {tq(lang, "margin", { margin: style.margin })}
            <input type="range" min={0} max={8} step={1} value={style.margin} onChange={(event) => setStyle({ ...style, margin: Number(event.target.value) })} />
          </label>
          <div className="flex gap-4">
            <label className={labelClass}>
              {tq(lang, "foreground")}
              <input type="color" value={style.foreground} onChange={(event) => setStyle({ ...style, foreground: event.target.value })} className="h-9 w-16 cursor-pointer rounded border border-(--border) bg-transparent p-0.5" />
            </label>
            <label className={labelClass}>
              {tq(lang, "background")}
              <input type="color" value={style.background} onChange={(event) => setStyle({ ...style, background: event.target.value })} className="h-9 w-16 cursor-pointer rounded border border-(--border) bg-transparent p-0.5" />
            </label>
          </div>
          {warning && (
            <p role="alert" className="text-sm text-(--warning) sm:col-span-2">
              {tq(lang, warning === "lowContrast" ? "warnLowContrast" : "warnInverted")}
            </p>
          )}
        </fieldset>
      </div>

      <div className="flex min-w-0 flex-col items-center gap-3">
        <div className={cn(panelClass, "flex w-full flex-col items-center gap-3")}>
          {matrix ? (
            <>
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={tq(lang, "preview")}
                className="h-auto w-full max-w-80 rounded-md"
                style={{ imageRendering: "pixelated", aspectRatio: "1 / 1" }}
              />
              <p className="text-xs text-(--muted-fg)">{tq(lang, "modulesInfo", { modules: matrix.size })}</p>
            </>
          ) : (
            <p className="py-16 text-center text-sm text-(--muted-fg)">{tq(lang, "previewEmpty")}</p>
          )}
          {built && "error" in built && (
            <p role="alert" className="text-center text-sm text-(--warning)">
              {built.error === "tooLong" ? tq(lang, "tooLong") : built.message}
            </p>
          )}
        </div>
        {matrix && (
          <>
            <div className="flex flex-wrap justify-center gap-2">
              <ActionButton onClick={downloadPng}>
                <Download aria-hidden="true" className="size-4" />
                {tq(lang, "downloadPng")}
              </ActionButton>
              <ActionButton variant="secondary" onClick={downloadSvg}>
                <Download aria-hidden="true" className="size-4" />
                {tq(lang, "downloadSvg")}
              </ActionButton>
              <ActionButton variant="secondary" onClick={copyImage}>
                {tq(lang, "copyImage")}
              </ActionButton>
            </div>
            <p role="status" className="text-sm text-(--muted-fg)">
              {copyState === "ok" ? tq(lang, "imageCopied") : copyState === "failed" ? tq(lang, "imageCopyFailed") : ""}
            </p>
            <details className="w-full text-sm">
              <summary className="cursor-pointer text-(--muted-fg)">{tq(lang, "showPayload")}</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-(--border) bg-(--surface) p-2 font-mono text-xs">{payload}</pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ scan */

type CameraState = "off" | "starting" | "scanning" | "denied" | "unavailable" | { error: string };

function ScanTab({ lang, onUse }: { lang: AppLang; onUse: (text: string) => void }) {
  const [camera, setCamera] = React.useState<CameraState>("off");
  const [results, setResults] = React.useState<ScanResult[]>([]);
  const [imageMessage, setImageMessage] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const frameRef = React.useRef<number>(0);
  const lastTextRef = React.useRef<string>("");

  const addResult = React.useCallback((text: string) => {
    if (text === lastTextRef.current) return;
    lastTextRef.current = text;
    setResults((previous) => [parseScanResult(text), ...previous.filter((item) => item.text !== text)].slice(0, 8));
  }, []);

  const stopCamera = React.useCallback(() => {
    window.cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("off");
  }, []);

  React.useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      setCamera("scanning");

      let last = 0;
      let busy = false;
      const tick = (time: number) => {
        frameRef.current = window.requestAnimationFrame(tick);
        if (busy || time - last < 120 || video.videoWidth === 0) return;
        last = time;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ratio = Math.min(1, 800 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * ratio);
        canvas.height = Math.round(video.videoHeight * ratio);
        canvas.getContext("2d", { willReadFrequently: true })?.drawImage(video, 0, 0, canvas.width, canvas.height);
        busy = true;
        decodeFrame(canvas)
          .then((text) => {
            if (text) addResult(text);
          })
          .finally(() => {
            busy = false;
          });
      };
      frameRef.current = window.requestAnimationFrame(tick);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const name = (error as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") setCamera("denied");
      else if (name === "NotFoundError" || name === "OverconstrainedError") setCamera("unavailable");
      else setCamera({ error: error instanceof Error ? error.message : String(error) });
    }
  };

  const scanImage = React.useCallback(
    async (file: Blob) => {
      setImageMessage(null);
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const text = await decodeImageFile(file, canvas);
        if (text) {
          lastTextRef.current = "";
          addResult(text);
        } else {
          setImageMessage(tq(lang, "imageNone"));
        }
      } catch {
        setImageMessage(tq(lang, "imageError"));
      }
    },
    [addResult, lang],
  );

  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
      if (file) {
        event.preventDefault();
        void scanImage(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [scanImage]);

  const cameraMessage = (() => {
    if (camera === "starting") return tq(lang, "cameraStarting");
    if (camera === "scanning") return tq(lang, "cameraScanning");
    if (camera === "denied") return tq(lang, "cameraDenied");
    if (camera === "unavailable") return tq(lang, "cameraUnavailable");
    if (typeof camera === "object") return tq(lang, "cameraError", { message: camera.error });
    return "";
  })();
  const cameraOn = camera === "starting" || camera === "scanning";
  const latest = results[0];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <div className={cn(panelClass, "flex flex-col gap-3")}>
          <div className={cn("relative aspect-video overflow-hidden rounded-md bg-black", !cameraOn && "hidden")}>
            <video ref={videoRef} aria-label={tq(lang, "cameraLabel")} className="size-full object-cover" playsInline muted />
          </div>
          <div className="flex items-center gap-3">
            {cameraOn ? (
              <ActionButton variant="secondary" onClick={stopCamera}>
                <CameraOff aria-hidden="true" className="size-4" />
                {tq(lang, "stopCamera")}
              </ActionButton>
            ) : (
              <ActionButton onClick={startCamera}>
                <Camera aria-hidden="true" className="size-4" />
                {tq(lang, "startCamera")}
              </ActionButton>
            )}
          </div>
          <p role="status" className={cn("text-sm", typeof camera === "object" || camera === "denied" || camera === "unavailable" ? "text-(--warning)" : "text-(--muted-fg)")}>
            {cameraMessage}
          </p>
        </div>

        <section aria-labelledby="qr-image-title" className="flex flex-col gap-2">
          <h2 id="qr-image-title" className="text-sm font-semibold">
            {tq(lang, "orImage")}
          </h2>
          <FilePicker lang={lang} accept="image/*" prompt={tq(lang, "pickImage")} compact onFiles={([file]) => file && void scanImage(file)} />
          {imageMessage && (
            <p role="alert" className="text-sm text-(--warning)">
              {imageMessage}
            </p>
          )}
        </section>
        {/* Frames and images are decoded on this offscreen canvas. */}
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      </div>

      <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
        {latest && (
          <section className={cn(panelClass, "flex flex-col gap-3")} aria-labelledby="qr-result-title">
            <h2 id="qr-result-title" className="text-sm font-semibold">
              {tq(lang, "result")} · {tq(lang, kindLabelKey(latest))}
            </h2>
            <ResultBody lang={lang} result={latest} />
            <div className="flex flex-wrap gap-2">
              <CopyButton lang={lang} text={latest.text} />
              <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => onUse(latest.text)}>
                {tq(lang, "useResult")}
              </ActionButton>
            </div>
          </section>
        )}
        {results.length > 1 && (
          <section aria-labelledby="qr-history-title" className="flex flex-col gap-2">
            <h2 id="qr-history-title" className="text-sm font-semibold">
              {tq(lang, "history")}
            </h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {results.slice(1).map((item) => (
                <li key={item.text} className="truncate rounded-md border border-(--border) px-2.5 py-1.5" title={item.text}>
                  {item.text}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function kindLabelKey(result: ScanResult) {
  return ({ url: "kindUrl", wifi: "kindWifi", email: "kindEmail", phone: "kindPhone", sms: "kindSms", geo: "kindGeo", contact: "kindContact", text: "kindText" } as const)[result.kind];
}

function ResultBody({ lang, result }: { lang: AppLang; result: ScanResult }) {
  if (result.kind === "wifi") {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-(--muted-fg)">{tq(lang, "ssidLabel")}</dt>
        <dd className="break-all font-medium">{result.ssid}</dd>
        <dt className="text-(--muted-fg)">{tq(lang, "passwordLabel")}</dt>
        <dd className="break-all font-mono">{result.password || tq(lang, "noPasswordOpen")}</dd>
        <dt className="text-(--muted-fg)">{tq(lang, "securityLabel")}</dt>
        <dd>{result.security || "—"}</dd>
      </dl>
    );
  }
  return (
    <>
      <p className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-sm">{result.text}</p>
      {result.kind === "url" && (
        <div className="flex flex-col gap-1">
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="self-start text-sm font-medium text-(--accent) underline underline-offset-2">
            {tq(lang, "openLink")} ↗
          </a>
          <p className="text-xs text-(--muted-fg)">{tq(lang, "linkWarning")}</p>
        </div>
      )}
      {result.kind === "geo" && Number.isFinite(Number.parseFloat(result.latitude)) && Number.isFinite(Number.parseFloat(result.longitude)) && (
        <a
          href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(result.latitude)}&mlon=${encodeURIComponent(result.longitude)}#map=16/${encodeURIComponent(result.latitude)}/${encodeURIComponent(result.longitude)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start text-sm font-medium text-(--accent) underline underline-offset-2"
        >
          {tq(lang, "openMap")} ↗
        </a>
      )}
    </>
  );
}
