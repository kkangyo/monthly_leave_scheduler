import React, { useCallback, useEffect, useState } from "react";
import Modal from "react-modal";
import superadminAPI, { StoreSummary } from "./apis/superadmin";
import { useAuth } from "./hooks/useAuth";

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #ccc",
  borderRadius: "6px",
  fontSize: "14px",
};

const formatDate = (value?: string) => (value ? String(value).slice(0, 10) : "-");

interface StoreManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

// 슈퍼관리자 전용 매장 관리 창: 매장 목록 조회 / 생성 / 전환 / 삭제.
// 전환은 토큰을 다시 받지 않고 profile.storeId(=X-Store-Id 헤더)만 바꾼다(useAuth.switchStore).
const StoreManager: React.FC<StoreManagerProps> = ({ isOpen, onClose }) => {
  const { profile, switchStore } = useAuth();
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await superadminAPI.listStores();
      if (Array.isArray(result?.stores)) setStores(result.stores);
      else setError(result?.msg ?? "매장 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      loadStores();
    }
  }, [isOpen, loadStores]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const storeCode = newCode.trim();
    const storeName = newName.trim();
    if (!storeCode || !storeName) return;
    setError(null);
    setIsCreating(true);
    try {
      const result = await superadminAPI.createStore(storeCode, storeName);
      if (!result?.storeId) {
        setError(result?.msg ?? "매장 생성에 실패했습니다.");
        return;
      }
      setNewCode("");
      setNewName("");
      await loadStores();
    } finally {
      setIsCreating(false);
    }
  };

  const handleSwitch = (store: StoreSummary) => {
    switchStore(store.store_id, store.store_name);
    onClose();
  };

  // 파괴적 작업이라 매장 코드를 직접 다시 입력해야만 진행
  const handleDelete = async (store: StoreSummary) => {
    const typed = window.prompt(
      `'${store.store_name}' 매장을 삭제하면 소속 직원/계정/휴무 이력/설정이 전부 삭제되고 되돌릴 수 없습니다.\n` +
        `계속하려면 매장 코드(${store.store_code})를 입력하세요.`
    );
    if (typed === null) return;
    if (typed.trim() !== store.store_code) {
      alert("매장 코드가 일치하지 않아 취소했습니다.");
      return;
    }
    const result = await superadminAPI.deleteStore(store.store_id);
    if (result?.statusCode !== 200) {
      setError(result?.msg ?? "매장 삭제에 실패했습니다.");
      return;
    }
    await loadStores();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel="매장 관리"
      style={{
        overlay: { backgroundColor: "rgba(0, 0, 0, 0.45)", zIndex: 900 },
        content: {
          position: "absolute",
          top: "5%",
          left: "50%",
          right: "auto",
          bottom: "auto",
          transform: "translateX(-50%)",
          width: "min(720px, calc(100vw - 32px))",
          maxHeight: "90vh",
          overflowY: "auto",
          boxSizing: "border-box",
          margin: 0,
          padding: "20px",
          borderRadius: "10px",
          background: "#ffffff",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.2)",
        },
      }}
    >
      <div style={{ position: "relative", marginBottom: "14px" }}>
        <h2 style={{ margin: 0, textAlign: "center" }}>매장 관리</h2>
        <button
          className="btn btn-secondary"
          style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)" }}
          onClick={onClose}
        >
          닫기
        </button>
      </div>

      <form
        onSubmit={handleCreate}
        style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", marginBottom: "14px" }}
      >
        <input
          type="text"
          placeholder="매장 코드 (영문/숫자/-/_)"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 160px" }}
        />
        <input
          type="text"
          placeholder="매장 이름"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 160px" }}
        />
        <button type="submit" className="btn" disabled={isCreating || !newCode.trim() || !newName.trim()}>
          {isCreating ? "생성 중..." : "매장 생성"}
        </button>
      </form>

      {error && <div style={{ color: "#d93025", fontSize: "13px", marginBottom: "10px" }}>{error}</div>}

      <div style={{ overflowX: "auto" }}>
        <table className="table-style" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>매장 코드</th>
              <th>매장 이름</th>
              <th>직원</th>
              <th>계정</th>
              <th>생성일</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => {
              const isCurrent = store.store_id === profile?.storeId;
              return (
                <tr key={store.store_id} style={isCurrent ? { fontWeight: 600 } : undefined}>
                  <td>{store.store_code}</td>
                  <td>
                    {store.store_name}
                    {isCurrent && <span style={{ color: "#1a73e8", marginLeft: "6px" }}>(현재)</span>}
                  </td>
                  <td>{store.agent_count ?? "-"}</td>
                  <td>{store.account_count ?? "-"}</td>
                  <td>{formatDate(store.created_at)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleSwitch(store)}
                      disabled={isCurrent}
                      style={{ marginRight: "6px" }}
                    >
                      전환
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(store)}
                      disabled={isCurrent}
                      title={isCurrent ? "현재 보고 있는 매장은 다른 매장으로 전환한 뒤 삭제할 수 있습니다" : undefined}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && stores.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "#888" }}>
                  매장이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};

export default StoreManager;
