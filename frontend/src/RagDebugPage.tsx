import SemanticSearchDebugPanel from "./SemanticSearchDebugPanel";

export default function RagDebugPage() {
    return (
        <div className="page-container">
            <header className="page-header">
                <div className="page-title">
                    <h1>RAG 调试</h1>
                    <p>语义检索与向量数据库调试工具</p>
                </div>
            </header>
            <div className="page-content" style={{ flex: 1, overflow: "hidden", padding: "24px" }}>
                <SemanticSearchDebugPanel />
            </div>
        </div>
    );
}
