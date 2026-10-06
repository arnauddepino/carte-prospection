import { Popup } from "react-leaflet";

// Fiche d'édition d'un bâtiment (ouverte par clic droit / appui long).
export default function EditPopup({ form, latlng, typeName, onChange, onSave, onDelete, onClose }) {
  const field = (name) => ({
    value: form[name],
    onChange: (e) => onChange({ ...form, [name]: e.target.value }),
  });

  return (
    <Popup position={latlng} eventHandlers={{ remove: onClose }}>
      <div className="edit-popup">
        <strong>{form.id_batiment}</strong>
        <div className="edit-popup-type">Type : {typeName ?? "—"}</div>

        <label>
          Date :
          <input type="date" {...field("date")} />
        </label>
        <label>
          BAL :
          <input type="number" min="0" inputMode="numeric" {...field("bal")} />
        </label>
        <label>
          Code entrée :
          <input type="text" {...field("code_entree")} />
        </label>
        <label>
          Infos :
          <textarea rows="2" {...field("infos")} />
        </label>

        <div className="edit-popup-actions">
          <button onClick={onSave}>💾 Sauvegarder</button>
          {form.originalDate && (
            <button className="danger" onClick={onDelete}>🗑️ Supprimer</button>
          )}
        </div>
      </div>
    </Popup>
  );
}
