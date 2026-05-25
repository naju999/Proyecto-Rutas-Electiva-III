export default function TunjaLocationSearchField({
  id,
  label,
  placeholder,
  value,
  onChange,
  suggestions = [],
  onSelectSuggestion,
  helperText = '',
  showSuggestions = true
}) {
  const hasSuggestions = showSuggestions && Array.isArray(suggestions) && suggestions.length > 0;

  return (
    <div className="location-search-field">
      {label ? <label htmlFor={id}>{label}</label> : null}
      <div className="location-search-wrap">
        <input
          id={id}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={hasSuggestions ? 'true' : 'false'}
        />
        {hasSuggestions ? (
          <div className="general-dropdown location-suggestions" role="listbox" aria-label={`Sugerencias de ${label ?? 'ubicacion'}`}>
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.source ?? 'local'}_${suggestion.label}_${suggestion.lat}_${suggestion.lng}`}
                type="button"
                className="general-option"
                onClick={() => onSelectSuggestion?.(suggestion)}
              >
                <span className="general-option-copy">
                  <strong>{suggestion.displayName || suggestion.label}</strong>
                  <span>{suggestion.note || 'Coincidencia en Tunja'}</span>
                </span>
                <span className="general-option-action">Usar</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {helperText ? <p className="location-search-note">{helperText}</p> : null}
    </div>
  );
}
