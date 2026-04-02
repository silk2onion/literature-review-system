import { useState } from "react";
import { API_BASE_URL } from "../../api/config";

interface PdfUploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

export default function PdfUploadModal({
  open,
  onClose,
  onUploaded,
}: PdfUploadModalProps) {
  const [uploading, setUploading] = useState(false);

  if (!open) return null;

  const handleUploadPdf = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/api/papers/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Upload failed");
      }

      const result = await response.json();
      alert(
        `上传成功！\n识别 DOI: ${result.doi || "无"}\n标题: ${result.title}`,
      );
      onClose();
      // FE-001: call fetchData via callback instead of window.location.reload()
      onUploaded();
    } catch (error: unknown) {
      console.error("Upload error:", error);
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      alert(`上传失败: ${errorMessage}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => !uploading && onClose()}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">上传本地 PDF</h3>
        <p className="modal-description">
          系统将自动解析 PDF 内容、识别 DOI
          并尝试获取元数据。同时会生成全文向量索引以支持 RAG 问答。
        </p>

        <div style={{ marginBottom: 20 }}>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleUploadPdf(e.target.files[0]);
              }
            }}
            disabled={uploading}
            className="file-input"
          />
        </div>

        {uploading && (
          <div className="upload-status">
            正在处理中，请稍候... (解析、OCR、向量化)
          </div>
        )}

        <div className="modal-actions">
          <button
            onClick={onClose}
            disabled={uploading}
            className="action-button"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
