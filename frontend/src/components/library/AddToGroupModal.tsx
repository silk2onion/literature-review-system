import GroupManager from "../../GroupManager";
import type { LiteratureGroup } from "../../types";

interface AddToGroupModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (group: LiteratureGroup) => void;
}

export default function AddToGroupModal({
  open,
  onClose,
  onConfirm,
}: AddToGroupModalProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>选择要加入的分组</h3>
          <button onClick={onClose} className="close-button">
            ×
          </button>
        </div>
        <GroupManager onSelectGroup={onConfirm} />
      </div>
    </div>
  );
}
