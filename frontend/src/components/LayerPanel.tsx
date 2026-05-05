import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { operationLabel } from "../maskState";
import type { LayerOperation, PolygonLayer } from "../types";

interface Props {
  layers: PolygonLayer[];
  activeLayerId: string | null;
  onActive: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<PolygonLayer>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

export function LayerPanel({ layers, activeLayerId, onActive, onUpdate, onDelete, onMove }: Props) {
  if (layers.length === 0) {
    return <p className="empty-state">No polygon layers.</p>;
  }

  return (
    <div className="layer-list">
      {layers.map((layer, index) => (
        <article className={layer.id === activeLayerId ? "layer active" : "layer"} key={layer.id}>
          <div className="layer-header">
            <input
              value={layer.name}
              onFocus={() => onActive(layer.id)}
              onChange={(event) => onUpdate(layer.id, { name: event.target.value })}
            />
            <input
              type="checkbox"
              checked={layer.enabled}
              onChange={(event) => onUpdate(layer.id, { enabled: event.target.checked })}
              title="Toggle layer"
            />
          </div>
          <div className="layer-controls">
            <select
              value={layer.operation}
              onChange={(event) => onUpdate(layer.id, { operation: event.target.value as LayerOperation })}
            >
              {(["union", "difference", "intersection"] as LayerOperation[]).map((operation) => (
                <option value={operation} key={operation}>
                  {operationLabel(operation)}
                </option>
              ))}
            </select>
            <button disabled={index === 0} onClick={() => onMove(layer.id, -1)} title="Move up">
              <ArrowUp size={14} />
            </button>
            <button disabled={index === layers.length - 1} onClick={() => onMove(layer.id, 1)} title="Move down">
              <ArrowDown size={14} />
            </button>
            <button onClick={() => onDelete(layer.id)} title="Delete layer">
              <Trash2 size={14} />
            </button>
          </div>
          <div className="bounds-grid compact">
            <label>
              Z min
              <input
                type="number"
                value={layer.z_min}
                onChange={(event) => onUpdate(layer.id, { z_min: Number(event.target.value) })}
              />
            </label>
            <label>
              Z max
              <input
                type="number"
                value={layer.z_max}
                onChange={(event) => onUpdate(layer.id, { z_max: Number(event.target.value) })}
              />
            </label>
          </div>
        </article>
      ))}
    </div>
  );
}
