import { useRef, useState } from "react";
import { Upload, X, File as FileIcon } from "lucide-react";
import { vibex } from "@/api/vibexClient";

const uploadDefault = async (file, folder) => {
  try {
    const result = await vibex.integrations.Core.UploadFile({ file, folder });
    return result?.data?.file_url || null;
  } catch (error) {
    console.error("Upload failed:", error);
    return null;
  }
};

/**
 * FileDropzone — compact single-row upload control.
 * Drag-and-drop, click, clipboard paste; thumbnail + file name + remove after selection.
 * value/onChange: uploaded file URL (controlled)
 * upload: optional async (file) => url — video pages pass an ensureH264-wrapped handler
 */
export default function FileDropzone({
  value = "",
  onChange,
  accept = "image/*",
  folder = "images",
  upload,
  placeholder = "파일을 끌어다 놓거나 클릭해서 선택",
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const matches = (file) =>
    accept === "*" ||
    accept.split(",").some((a) => {
      const t = a.trim().toLowerCase();
      if (t.endsWith("/*")) return file.type.toLowerCase().startsWith(t.slice(0, -1));
      if (t.startsWith(".")) return file.name.toLowerCase().endsWith(t);
      return file.type.toLowerCase() === t;
    });

  const handleFile = async (file) => {
    if (!file) return;
    if (!matches(file)) {
      setError("허용되지 않는 파일 형식입니다.");
      return;
    }
    setError("");
    setBusy(true);
    setFileName(file.name);
    const url = await (upload ? upload(file) : uploadDefault(file, folder));
    setBusy(false);
    if (url) onChange?.(url);
    else {
      setFileName("");
      setError("업로드에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  const openDialog = () => inputRef.current?.click();
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };
  const onPaste = (e) => {
    const pasted = e.clipboardData?.files?.[0];
    if (pasted) handleFile(pasted);
  };
  const clear = (e) => {
    e.stopPropagation();
    setFileName("");
    setError("");
    onChange?.("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const isImage = Boolean(value) && accept.startsWith("image");
  const shownName = fileName || (value ? value.split("/").pop() : "");

  return (
    <div className="w-full" onPaste={onPaste}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="파일 업로드"
        className={`flex h-11 w-full items-center gap-3 rounded-lg border border-dashed px-3 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
        }`}
        onClick={openDialog}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openDialog()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {value ? (
          <>
            {isImage ? (
              <img src={value} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
            ) : (
              <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{shownName}</span>
            <button
              type="button"
              onClick={clear}
              aria-label="제거"
              className="shrink-0 rounded-full p-1 hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {busy ? "업로드 중..." : placeholder}
            </span>
            <span className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs">파일 선택</span>
          </>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
