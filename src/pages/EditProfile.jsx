import React from 'react';

function EditProfile({
    displayName,
    setDisplayName,
    currentUser,
    createdAtMonth,
    isSaving,
    isEditing,
    setIsEditing,
    handleSaveProfile,
    userProfile
}) {
    if (!isEditing) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'flex-end',
            zIndex: 1000
        }}>
            <div style={{
                width: '100%',
                backgroundColor: 'white',
                borderRadius: '8px 8px 0 0',
                animation: 'slideUp 0.3s ease-out',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '75vh'
            }}>
                <div style={{
                    padding: '15px 20px',
                    overflowY: 'auto',
                    flex: 1,
                    minHeight: 0
                }}>
                    <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '16px', fontWeight: '600' }}>Editar Perfil</h3>

                    {/* Sección Foto de Perfil */}
                    <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            margin: '0 auto 12px',
                            backgroundColor: '#e9ecef',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative'
                        }}>
                            <svg viewBox="0 0 24 24" style={{ width: '40px', height: '40px', stroke: '#999', fill: 'none', strokeWidth: 2 }}>
                                <circle cx="12" cy="8" r="4"></circle>
                                <path d="M5 20a7 7 0 0 1 14 0"></path>
                            </svg>
                        </div>
                        <button
                            type="button"
                            className="logout-button small-button"
                        >
                            Cambiar Foto
                        </button>
                    </div>

                    {/* Sección Campos */}
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '13px' }}>
                            Nombre:
                        </label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Tu nombre"
                            style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                                fontSize: '13px',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '13px' }}>
                            Email:
                        </label>
                        <input
                            type="email"
                            value={currentUser?.email || ''}
                            disabled
                            style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                                fontSize: '13px',
                                boxSizing: 'border-box',
                                backgroundColor: '#f5f5f5',
                                color: '#999'
                            }}
                        />
                    </div>

                    {createdAtMonth && (
                        <div style={{ marginBottom: '0' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '13px' }}>
                                Cuenta creada:
                            </label>
                            <p style={{ margin: '0', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px', color: '#666', fontSize: '13px' }}>
                                {createdAtMonth}
                            </p>
                        </div>
                    )}
                </div>

                <div style={{
                    padding: '15px 20px 75px',
                    borderTop: '1px solid #eee',
                    display: 'flex',
                    gap: '10px',
                    flexShrink: 0
                }}>
                    <button onClick={handleSaveProfile} disabled={isSaving} className="submit-button" style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                        {isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button onClick={() => { setIsEditing(false); setDisplayName(userProfile?.displayName || ''); }} disabled={isSaving} className="logout-button" style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            Cancelar
                        </span>
                    </button>
                </div>
                <style>{`
          @keyframes slideUp {
            from {
              transform: translateY(100%);
            }
            to {
              transform: translateY(0);
            }
          }
        `}</style>
            </div>
        </div>
    );
}

export default EditProfile;
