import SemanticSearchDebugPanel from "../components/SemanticSearchDebugPanel";
import { useLocale } from "../hooks/useLocale";

export default function RagDebugPage() {
    const { t } = useLocale();
    return (
        <div className="page-container">
            <header className="page-header">
                <div className="page-title">
                    <h1>{t("rag.debugTitle")}</h1>
                    <p>{t("rag.debugSubtitle")}</p>
                </div>
            </header>
            <div className="page-content" style={{ flex: 1, overflow: "hidden", padding: "24px" }}>
                <SemanticSearchDebugPanel />
            </div>
        </div>
    );
}
