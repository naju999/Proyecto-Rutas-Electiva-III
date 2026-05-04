import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { createUserProfile, getUserProfile } from '../firebase/firestoreService';

// Crear el contexto
const AuthContext = createContext();

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
      
      // Crear perfil en Firestore
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
  const loadUserProfile = async (userId) => {
    try {
      const profile = await getUserProfile(userId);
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
        loadUserProfile(user.uid);
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
