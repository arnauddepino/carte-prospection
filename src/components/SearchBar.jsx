import { useEffect, useState } from "react";
import { searchAddress } from "../lib/adresse";
import Icon from "./Icon";

// Recherche d'adresse en haut de l'écran (Base Adresse Nationale).
export default function SearchBar({ map, onSelect, onClear }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState(null); // adresse choisie : pas de nouvelles suggestions

  // Suggestions au fil de la frappe, avec un léger délai.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || q === picked) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchAddress(q, map?.getCenter());
        if (!cancelled) {
          setResults(found);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, map, picked]);

  const choose = (result) => {
    setPicked(result.label);
    setQuery(result.label);
    setResults([]);
    document.activeElement?.blur(); // referme le clavier
    onSelect(result);
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    onClear();
  };

  return (
    <div className="search">
      <form
        className="search-field"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (results[0]) choose(results[0]);
        }}
      >
        <Icon name="search" size={20} />
        <input
          type="search"
          placeholder="Rechercher une adresse"
          aria-label="Rechercher une adresse"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="icon-button small" aria-label="Effacer" onClick={clear}>
            <Icon name="close" size={18} />
          </button>
        )}
      </form>

      {(results.length > 0 || failed) && (
        <ul className="search-results">
          {failed && <li className="search-empty">Recherche indisponible (réseau ?)</li>}
          {results.map((r) => (
            <li key={`${r.label}-${r.lat}`}>
              <button type="button" onClick={() => choose(r)}>
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
