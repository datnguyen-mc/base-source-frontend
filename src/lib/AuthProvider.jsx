import React, { useState, useEffect } from 'react';
import { vibex } from '@/api/vibexClient';
import { GetProjectInfo } from '@/api/integrations';
import { AuthContext } from './AuthContext';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);
    const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
    const [authError, setAuthError] = useState(null);
    const [appPublicSettings, setAppPublicSettings] = useState(null);
    const [projectInfo, setProjectInfo] = useState(null);

    useEffect(() => {
        checkAppState();
    }, []);

    const checkAppState = async () => {
        try {
            setAuthError(null);

            // Fetch project info before anything else
            try {
                const info = await GetProjectInfo();
                setProjectInfo(info);
            } catch (projectError) {
                console.error('GetProjectInfo failed:', projectError);
                setAuthError({
                    type: 'project_info_failed',
                    message: projectError.message || 'Failed to load project info'
                });
                setIsLoadingAuth(false);
                return;
            }

            try {
                const token = localStorage.getItem("access_token");
                if (!token) {
                    const currentPath = location.pathname.toLowerCase();
                    const isPrivate = Object.keys({})
                        .map((k) => `/${k.toLowerCase()}`)
                        .some((p) => currentPath.startsWith(p));

                    if (isPrivate) {
                        navigate("/", { replace: true });
                    }

                    setIsAuthenticated(false);
                    setIsLoadingAuth(false);
                    return;
                }
                await checkUserAuth();
            } catch (appError) {
                console.error('App state check failed:', appError);

                if (appError.status === 403 && appError.data?.extra_data?.reason) {
                    const reason = appError.data.extra_data.reason;
                    if (reason === 'auth_required') {
                        setAuthError({
                            type: 'auth_required',
                            message: 'Authentication required'
                        });
                    } else if (reason === 'user_not_registered') {
                        setAuthError({
                            type: 'user_not_registered',
                            message: 'User not registered for this app'
                        });
                    } else {
                        setAuthError({
                            type: reason,
                            message: appError.message
                        });
                    }
                } else {
                    setAuthError({
                        type: 'unknown',
                        message: appError.message || 'Failed to load app'
                    });
                }
                setIsLoadingAuth(false);
            }
        } catch (error) {
            console.error('Unexpected error:', error);
            setAuthError({
                type: 'unknown',
                message: error.message || 'An unexpected error occurred'
            });
            setIsLoadingAuth(false);
        }
    };

    const checkUserAuth = async () => {
        try {
            setIsLoadingAuth(true);
            const res = await vibex.auth.me();
            setUser(res?.data || null);
            setIsAuthenticated(true);
            setIsLoadingAuth(false);
        } catch (error) {
            console.error('User auth check failed:', error);
            setIsLoadingAuth(false);
            setIsAuthenticated(false);
            if (error.status === 401 || error.status === 403) {
                setAuthError({
                    type: 'auth_required',
                    message: 'Authentication required'
                });
            }
        }
    };

    const logout = (shouldRedirect = true) => {
        setUser(null);
        setIsAuthenticated(false);

        if (shouldRedirect) {
            vibex.auth.logout(window.location.href);
        } else {
            vibex.auth.logout();
        }
    };

    const navigateToLogin = () => {
        vibex.auth.redirectToLogin(window.location.href);
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated,
            isLoadingAuth,
            isLoadingPublicSettings,
            authError,
            appPublicSettings,
            projectInfo,
            logout,
            navigateToLogin,
            checkAppState,
            setUser
        }}>
            {children}
        </AuthContext.Provider>
    );
};