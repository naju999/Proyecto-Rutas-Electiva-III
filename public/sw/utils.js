/**
 * Funciones utilitarias para el Service Worker
 */

/**
 * Ejecutar fetch con timeout.
 * Usa AbortController para cancelar después de timeoutMs.
 */
export async function fetchWithTimeout(request, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(request, {
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Enviar mensaje a un cliente (port).
 */
export function postPortMessage(port, message) {
    if (!port) return;
    port.postMessage(message);
}
