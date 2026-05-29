import { db } from './config';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    getDocs,
    addDoc,
    serverTimestamp,
    orderBy,
    limit,
    onSnapshot
} from 'firebase/firestore';

// ===== USUARIO =====
export async function createUserProfile(userId, userData) {
    try {
        await setDoc(doc(db, 'users', userId), {
            email: userData.email,
            displayName: userData.displayName || '',
            photoURL: userData.photoURL || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.error('Error creando perfil:', err);
        throw err;
    }
}

export async function getUserProfile(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        return userDoc.exists() ? userDoc.data() : null;
    } catch (err) {
        console.error('Error obteniendo perfil:', err);
        throw err;
    }
}

export async function updateUserProfile(userId, updates) {
    try {
        await setDoc(doc(db, 'users', userId), {
            ...updates,
            updatedAt: serverTimestamp(),
        }, { merge: true });
    } catch (err) {
        console.error('Error actualizando perfil:', err);
        throw err;
    }
}

// ===== VALORACIONES DE RUTAS =====
export async function setRouteRating(userId, routeId, rating) {
    if (!userId || !routeId) {
        throw new Error('userId y routeId son requeridos para guardar una calificación');
    }

    try {
        const ratingRef = doc(db, 'routeRatings', `${encodeURIComponent(userId)}_${encodeURIComponent(routeId)}`);
        await setDoc(ratingRef, {
            userId,
            routeId,
            rating: Number(rating),
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (err) {
        console.error('Error guardando calificación de ruta:', err);
        throw err;
    }
}

export async function getRouteRatingSummary(routeId) {
    try {
        const ratingsRef = collection(db, 'routeRatings');
        const q = query(ratingsRef, where('routeId', '==', routeId));
        const snapshot = await getDocs(q);
        const ratings = snapshot.docs.map((doc) => doc.data());

        if (ratings.length === 0) {
            return { count: 0, total: 0, average: 5 };
        }

        const count = ratings.length;
        const total = ratings.reduce((sum, item) => sum + Number(item.rating || 0), 0);
        const average = Number((total / count).toFixed(1));

        return { count, total, average };
    } catch (err) {
        console.error('Error obteniendo resumen de calificaciones:', err);
        throw err;
    }
}

export async function getRouteRatingSummaries(routeIds) {
    if (!Array.isArray(routeIds) || routeIds.length === 0) {
        return {};
    }

    try {
        const ratingsRef = collection(db, 'routeRatings');
        const summaries = {};
        const chunkSize = 10;

        for (let i = 0; i < routeIds.length; i += chunkSize) {
            const chunk = routeIds.slice(i, i + chunkSize);
            const q = query(ratingsRef, where('routeId', 'in', chunk));
            const snapshot = await getDocs(q);
            snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data();
                const routeId = String(data.routeId ?? '');
                if (!routeId) {
                    return;
                }

                const ratingValue = Number(data.rating ?? 0);
                if (!summaries[routeId]) {
                    summaries[routeId] = { count: 0, total: 0, average: 5 };
                }

                summaries[routeId].count += 1;
                summaries[routeId].total += ratingValue;
            });
        }

        Object.keys(summaries).forEach((routeId) => {
            const summary = summaries[routeId];
            summary.average = summary.count > 0 ? Number((summary.total / summary.count).toFixed(1)) : 5;
        });

        return summaries;
    } catch (err) {
        console.error('Error obteniendo resúmenes de calificaciones:', err);
        throw err;
    }
}

export function subscribeToRouteRatingSummaries(routeIds, callback) {
    if (!Array.isArray(routeIds) || routeIds.length === 0) {
        return () => {};
    }

    try {
        const ratingsRef = collection(db, 'routeRatings');
        const unsubscribers = [];

        routeIds.forEach((routeId) => {
            const q = query(ratingsRef, where('routeId', '==', routeId));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const ratings = snapshot.docs.map((doc) => doc.data());
                const count = ratings.length;
                const total = ratings.reduce((sum, item) => sum + Number(item.rating || 0), 0);
                const average = count > 0 ? Number((total / count).toFixed(1)) : 5;

                callback({
                    routeId,
                    summary: { count, total, average }
                });
            }, (error) => {
                console.error('Error suscribiendo a calificaciones de ruta:', error);
            });
            unsubscribers.push(unsubscribe);
        });

        return () => {
            unsubscribers.forEach((unsub) => unsub());
        };
    } catch (err) {
        console.error('Error en subscribeToRouteRatingSummaries:', err);
        return () => {};
    }
}

// ===== FAVORITOS =====
export async function addFavorite(userId, routeData) {
    try {
        const favoriteRef = collection(db, 'favorites', userId, 'routes');
        const newFavorite = await addDoc(favoriteRef, {
            origin: routeData.origin,
            destination: routeData.destination,
            distance: routeData.distance || '',
            estimatedTime: routeData.estimatedTime || '',
            transportModes: routeData.transportModes || [],
            createdAt: serverTimestamp(),
            addedAt: serverTimestamp(),
        });
        return newFavorite.id;
    } catch (err) {
        console.error('Error agregando favorito:', err);
        throw err;
    }
}

export async function setFavorite(userId, favoriteData) {
    try {
        const favoriteId = favoriteData?.id;

        if (!favoriteId) {
            throw new Error('favoriteData.id is required');
        }

        await setDoc(doc(db, 'favorites', userId, 'routes', favoriteId), {
            ...favoriteData,
            savedAt: favoriteData.savedAt ?? serverTimestamp(),
            createdAt: favoriteData.createdAt ?? serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (err) {
        console.error('Error guardando favorito:', err);
        throw err;
    }
}

export async function removeFavorite(userId, routeId) {
    try {
        await deleteDoc(doc(db, 'favorites', userId, 'routes', routeId));
    } catch (err) {
        console.error('Error eliminando favorito:', err);
        throw err;
    }
}

export async function getFavorites(userId) {
    try {
        const favoritesRef = collection(db, 'favorites', userId, 'routes');
        const snapshot = await getDocs(favoritesRef);
        return snapshot.docs
            .map(doc => ({
                id: doc.id,
                ...doc.data(),
            }))
            .sort((left, right) => {
                const leftDate = left.savedAt || left.addedAt || left.createdAt || '';
                const rightDate = right.savedAt || right.addedAt || right.createdAt || '';
                return String(rightDate).localeCompare(String(leftDate));
            });
    } catch (err) {
        console.error('Error obteniendo favoritos:', err);
        throw err;
    }
}

export function subscribeToFavorites(userId, callback) {
    try {
        const favoritesRef = collection(db, 'favorites', userId, 'routes');

        return onSnapshot(favoritesRef, (snapshot) => {
            const favorites = snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }))
                .sort((left, right) => {
                    const leftDate = left.savedAt || left.addedAt || left.createdAt || '';
                    const rightDate = right.savedAt || right.addedAt || right.createdAt || '';
                    return String(rightDate).localeCompare(String(leftDate));
                });
            callback(favorites);
        }, (error) => {
            console.error('Error suscribiendo a favoritos:', error);
        });
    } catch (err) {
        console.error('Error en subscribeToFavorites:', err);
        return () => { }; // Retornar función vacía si hay error
    }
}

// ===== BÚSQUEDAS RECIENTES =====
export async function addRecentSearch(userId, searchData) {
    try {
        const recentRef = collection(db, 'recentSearches', userId);
        await addDoc(recentRef, {
            origin: searchData.origin,
            destination: searchData.destination,
            distance: searchData.distance || '',
            duration: searchData.duration || '',
            timestamp: serverTimestamp(),
        });
    } catch (err) {
        console.error('Error agregando búsqueda reciente:', err);
        throw err;
    }
}

export async function getRecentSearches(userId, limitCount = 10) {
    try {
        const recentRef = collection(db, 'recentSearches', userId);
        const q = query(
            recentRef,
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    } catch (err) {
        console.error('Error obteniendo búsquedas recientes:', err);
        throw err;
    }
}

export function subscribeToRecentSearches(userId, callback, limitCount = 10) {
    try {
        const recentRef = collection(db, 'recentSearches', userId);
        const q = query(
            recentRef,
            orderBy('timestamp', 'desc'),
            limit(limitCount)
        );

        return onSnapshot(q, (snapshot) => {
            const searches = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));
            callback(searches);
        }, (error) => {
            console.error('Error suscribiendo a búsquedas:', error);
        });
    } catch (err) {
        console.error('Error en subscribeToRecentSearches:', err);
        return () => { }; // Retornar función vacía si hay error
    }
}
