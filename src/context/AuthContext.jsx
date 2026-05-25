import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { createUserProfile, getUserProfile } from '../firebase/firestoreService';

// Crear el contexto
const AuthContext = createContext();
const googleProvider = new GoogleAuthProvider();

async function ensureUserProfile(user, fallbackDisplayName = '') {
  const profile = await getUserProfile(user.uid);

  if (!profile) {
    await createUserProfile(user.uid, {
      email: user.email || '',
      displayName: user.displayName || fallbackDisplayName || '',
      photoURL: user.photoURL || ''
    });
  }

  return getUserProfile(user.uid);
}

// Proveedor del contexto
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Registrar usuario
  const signup = async (email, password, displayName = '') => {
    setError(null);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await createUserProfile(result.user.uid, {
        email: result.user.email,
        displayName: displayName || '',
        photoURL: ''
      });
      
      return result.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Iniciar sesión
  const login = async (email, password) => {
    setError(null);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const loginWithGoogle = async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserProfile(result.user);
      return result.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Cerrar sesión
  const logout = async () => {
    setError(null);
    try {
      await signOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Cargar perfil del usuario
  const loadUserProfile = async (user) => {
    try {
      const profile = await ensureUserProfile(user);
      setUserProfile(profile);
    } catch (err) {
      console.error('Error cargando perfil:', err);
    }
  };

  // Escuchar cambios en el estado de autenticación
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        loadUserProfile(user);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    // Limpiar suscripción al desmontar
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    signup,
    login,
    loginWithGoogle,
    logout,
    loading,
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook personalizado para usar el contexto
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
}
