import React, { useState, useEffect } from 'react';
import { vibex } from '@/api/vibexClient';
import {
    captureIpBlock,
    isIpBlocked,
    resetIpBlocked,
    IP_BLOCKED_EVENT,
} from '@/lib/ipBlock';
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

    // The app owner restricted this app to specific IP addresses and this visitor
    // is not on the list.
    //
    // Kept as its OWN state, not another `authError.type`, and it is STICKY — it
    // is never set back to false. `authError` is a single slot that the next
    // failure overwrites, and every blocked request returns 403, which
    // `checkUserAuth` below would otherwise read as "session expired" and turn
    // into a login redirect. This flag outranks all of that (see App.jsx, which
    // checks it before the loading state and before authError).
    //
    // Seeded from the module latch so a block that fired before this provider
    // mounted is not missed, and driven by its event so ANY blocked call anywhere
    // in the app flips it — not just the boot call below.
    const [ipBlocked, setIpBlocked] = useState(() => isIpBlocked());

    useEffect(() => {
        const onBlocked = () => setIpBlocked(true);
        window.addEventListener(IP_BLOCKED_EVENT, onBlocked);
        return () => window.removeEventListener(IP_BLOCKED_EVENT, onBlocked);
    }, []);

    useEffect(() => {
        checkAppState();
    }, []);

    const checkAppState = async () => {
        try {
            // Both flags, in this order: clearing the error alone would render
            // the real app for the duration of the request below, since
            // isLoadingAuth is already false on any retry. A blocked visitor
            // would see a flash of the UI they are being kept out of.
            setIsLoadingAuth(true);
            setAuthError(null);

            // Already blocked → every call below just returns another 403. Leave
            // the restricted screen up instead of churning through them.
            if (isIpBlocked()) {
                setIpBlocked(true);
                setIsLoadingAuth(false);
                return;
            }

            // Fetch project info before anything else
            try {
                const info = await GetProjectInfo();
                setProjectInfo(info);
            } catch (projectError) {
                console.error('GetProjectInfo failed:', projectError);
                // The owner restricted this app to specific IP addresses and this
                // visitor is not on the list. Flagged by `error_code` — the API's
                // error envelope is {code, message, data, error_code, timestamp},
                // so error_code is the field that actually survives to the client.
                const blocked = captureIpBlock(projectError);
                if (blocked) setIpBlocked(true);
                setAuthError({
                    type: blocked ? 'ip_not_allowed' : 'project_info_failed',
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

                // Highest priority — checked before every other reason so a
                // blocked visitor can never be routed to login instead.
                if (captureIpBlock(appError) || isIpBlocked()) {
                    setIpBlocked(true);
                    setIsLoadingAuth(false);
                    return;
                }

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
            // An IP-blocked visitor gets 403 on EVERY call, including auth/me.
            // Reading that as "authentication required" is what sent them to a
            // login page instead of the restricted screen. The block wins.
            if (captureIpBlock(error) || isIpBlocked()) {
                setIpBlocked(true);
                return;
            }
            if (error.status === 401 || error.status === 403) {
                setAuthError({
                    type: 'auth_required',
                    message: 'Authentication required'
                });
            }
        }
    };

    /**
     * Explicit user retry from the restricted screen — the ONLY thing allowed to
     * clear the block (e.g. the visitor reconnected from an approved network).
     */
    const retryIpAccess = () => {
        resetIpBlocked();
        setIpBlocked(false);
        setAuthError(null);
        return checkAppState();
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
            ipBlocked,
            retryIpAccess,
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