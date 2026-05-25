/**
 * OfflineSyncBadge - Muestra estado de sincronización offline
 * Indica cuántos cambios están pendientes de enviar
 */

import React, { useState, useEffect } from 'react';
import { useConnectivity } from '../pwa/connectivityMonitor';
import syncQueue from '../pwa/syncQueue';

const OfflineSyncBadge = () => {
  const { isOnline, pendingCount, isSyncing } = useConnectivity();
  const [showDetails, setShowDetails] = useState(false);

  // No mostrar si está online y no hay pendientes
  if (isOnline && pendingCount === 0) {
    return null;
  }

  const getBgColor = () => {
    if (isSyncing) return '#3b82f6'; // blue
    if (!isOnline) return '#f97316'; // orange
    return '#16a34a'; // green
  };

  const getStatusText = () => {
    if (isSyncing) return 'Sincronizando...';
    if (!isOnline) return `${pendingCount} cambios pendientes`;
    return `${pendingCount} cambios sincronizados`;
  };

  const getIcon = () => {
    if (isSyncing) {
      return (
        <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>
          ⚙️
        </span>
      );
    }
    if (!isOnline) return '📱';
    return '✅';
  };

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .offline-sync-badge {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background-color: ${getBgColor()};
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          z-index: 999;
          transition: all 0.3s ease;
          max-width: 300px;
        }

        .offline-sync-badge:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
        }

        .offline-sync-badge-badge {
          background-color: rgba(255, 255, 255, 0.3);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          min-width: 24px;
          text-align: center;
        }

        .offline-sync-details {
          position: fixed;
          bottom: 80px;
          right: 20px;
          background-color: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          max-width: 400px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          z-index: 998;
          color: #1f2937;
          font-size: 13px;
        }

        .offline-sync-details h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          color: #111827;
        }

        .offline-sync-details ul {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .offline-sync-details li {
          padding: 6px 0;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          border-bottom: 1px solid #f3f4f6;
        }

        .offline-sync-details li:last-child {
          border-bottom: none;
        }

        .offline-sync-details .method {
          font-weight: 600;
          color: #3b82f6;
          min-width: 50px;
        }

        .offline-sync-details .url {
          flex: 1;
          word-break: break-all;
          color: #666;
        }

        .offline-sync-details .status {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .offline-sync-details .status.pending {
          background-color: #fed7aa;
          color: #92400e;
        }

        .offline-sync-details .status.syncing {
          background-color: #bfdbfe;
          color: #1e40af;
        }

        .offline-sync-details .status.failed {
          background-color: #fecaca;
          color: #7f1d1d;
        }
      `}</style>

      {showDetails && pendingCount > 0 && <OfflineSyncDetails />}

      <div
        className="offline-sync-badge"
        onClick={() => setShowDetails(!showDetails)}
        title={getStatusText()}
      >
        <span>{getIcon()}</span>
        <span>{getStatusText()}</span>
        {pendingCount > 0 && <span className="offline-sync-badge-badge">{pendingCount}</span>}
      </div>
    </>
  );
};

/**
 * Detalles de items en sincronización
 */
function OfflineSyncDetails() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const loadItems = async () => {
      const allItems = await syncQueue.getAll();
      setItems(allItems);
    };

    loadItems();

    const unsubscribe = syncQueue.onChange(() => {
      loadItems();
    });

    return unsubscribe;
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="offline-sync-details">
      <h4>Cambios pendientes ({items.length})</h4>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span className="method">{item.method}</span>
            <span className="url">{item.url.replace(/^.*\/\/[^\/]+/, '')}</span>
            <span className={`status ${item.status}`}>{item.status}</span>
          </li>
        ))}
      </ul>
      {items.some((item) => item.status === 'failed') && (
        <div style={{ marginTop: '12px', color: '#dc2626', fontSize: '12px' }}>
          ⚠️ Algunos cambios fallaron. Se reintentarán cuando haya conexión.
        </div>
      )}
    </div>
  );
}

export default OfflineSyncBadge;
